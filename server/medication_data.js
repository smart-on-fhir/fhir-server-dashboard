const fs = require('fs');
const config = require('./config');
const lib = require('./lib');

function aggregate(fhirVersion) {
    const resource = fhirVersion.charAt(0) === '3' || fhirVersion === 'Not Provided'
        ? 'MedicationRequest' : 'MedicationOrder';
    lib.getAllResources(lib.buildFhirURL(resource,
        [`_include=${resource}:medication`, '_count=50']), handleMedData);
}

function handleMedData(data) {
    const medData = data.reduce((acc, element) => {
        return updateMedData(acc, element.resource);
    }, { rxnormCodes: {}, medIDs: {}, medLookup: {}, });

    Object.keys(medData.medIDs).forEach((medReference) => {
        const rxnormCode = medData.medLookup[medReference];
        medData.rxnormCodes = lib.setInitialObjValue(medData.rxnormCodes, rxnormCode, []);
        const patientsToAdd = medData.medIDs[medReference].filter((patient) => {
            return !medData.rxnormCodes[rxnormCode].includes(patient);
        });
        medData.rxnormCodes[rxnormCode] = medData.rxnormCodes[rxnormCode].concat(patientsToAdd);
    });
    handleRxnormCodes(medData.rxnormCodes);
}

function updateMedData(medData, resource) {
    const dataCopy = JSON.parse(JSON.stringify(medData));
    if (resource.resourceType.endsWith('Request') || resource.resourceType.endsWith('Order')) {
        let patient = resource.subject || resource.patient;
        if (!patient || !patient.reference) return dataCopy;
        patient = patient.reference;
        const medCode = lib.checkPath(resource, ['medicationCodeableConcept', 'coding', 0, 'code']);

        if (medCode) {
            dataCopy.rxnormCodes = lib.pushStringToObj(dataCopy.rxnormCodes, medCode, patient);
        } else if (lib.checkPath(resource, ['medicationReference', 'reference'])) {
            const medID = resource.medicationReference.reference.split('on/')[1];
            dataCopy.medIDs = lib.pushStringToObj(dataCopy.medIDs, medID, patient);
        }
    } else if (lib.checkPath(resource, ['code', 'coding', 0, 'code'])) {
        dataCopy.medLookup[resource.id] = resource.code.coding[0].code;
    }
    return dataCopy;
}

function handleRxnormCodes(rxnormCodes) {
    let rxnormCodesCopy = JSON.parse(JSON.stringify(rxnormCodes));
    const rxnormLookup = JSON.parse(fs.readFileSync(config.RXNORM_FILE_PATH).toString());
    const notInLookup = [];
    Object.keys(rxnormCodesCopy).forEach((code) => {
        rxnormCodesCopy[code] = rxnormCodesCopy[code].length;
        const lookup = rxnormLookup[code];
        if (lookup === 'Delete') {
            delete rxnormCodesCopy[code];
        } else if (lookup && isNaN(lookup)) {
            rxnormCodesCopy = updateRxnormCodes(rxnormCodesCopy, lookup, code);
        } else if (lookup && !isNaN(lookup) && isNaN(rxnormLookup[lookup])) {
            rxnormCodesCopy = updateRxnormCodes(rxnormCodesCopy, rxnormLookup[lookup], code);
        } else {
            notInLookup.push(code);
        }
    });
    const rxnormURL = (tty) => `/related.json?tty=${tty}IN`;
    const options = {
        rxnormCodes: rxnormCodesCopy,
        codesToLookup: notInLookup,
        paths: ['/status.json', rxnormURL('M'), rxnormURL('P'), rxnormURL('')],
        arrIN: [],
        cache: {},
    };
    new Promise(done => getMedNames(options, done)).then(medNames => saveMedData(medNames));
}

function getMedNames(options, done) {
    const optionsCopy = JSON.parse(JSON.stringify(options));
    if (optionsCopy.paths.length === 0) {
        done(optionsCopy);
        return;
    }

    optionsCopy.result = {};
    optionsCopy.path = optionsCopy.paths.shift();
    new Promise(resolve => callRxnormAPI(optionsCopy, resolve))
        .then(newOptions => getMedNames(newOptions, done));
}

function callRxnormAPI(options, resolve) {
    const optionsCopy = JSON.parse(JSON.stringify(options));
    const rxnormPromises = optionsCopy.codesToLookup.map((rxnormCode) => {
        return new Promise((done) => {
            const rxnormURL = `https://rxnav.nlm.nih.gov/REST/rxcui/${rxnormCode + options.path}`;
            lib.httpRequest(rxnormURL, (response) => {
                optionsCopy.result[rxnormCode] = response;
                done();
            });
        });
    });

    Promise.all(rxnormPromises).then(() => {
        optionsCopy.codesToLookup = [];
        const callbackFunc = options.path === '/status.json' ? handleRxnormStatus : parseRxnormData;
        resolve(callbackFunc(optionsCopy));
    });
}

function handleRxnormStatus(options) {
    const optionsCopy = JSON.parse(JSON.stringify(options));
    Object.keys(optionsCopy.result).forEach((rxnormCode) => {
        const codeStatus = optionsCopy.result[rxnormCode].rxcuiStatus;
        const statusText = codeStatus.status;
        if (statusText === 'Remapped' || statusText === 'Quantified' || statusText === 'Active') {
            const newCode = codeStatus.minConceptGroup.minConcept[0].rxcui;
            if (statusText !== 'Active') {
                optionsCopy.rxnormCodes = saveMedName(optionsCopy, newCode, rxnormCode);
            }
            optionsCopy.codesToLookup.push(newCode);
        } else {
            optionsCopy.cache[rxnormCode] = 'Delete';
            delete optionsCopy.rxnormCodes[rxnormCode];
        }
    });
    return optionsCopy;
}

function parseRxnormData(options) {
    const optionsCopy = JSON.parse(JSON.stringify(options));
    if (optionsCopy.path.endsWith('=PIN')) {
        optionsCopy.codesToLookup = optionsCopy.arrIN;
    }
    Object.keys(optionsCopy.result).forEach((rxnormCode) => {
        const apiResponse = optionsCopy.result[rxnormCode];
        const rxnormConcept = apiResponse.relatedGroup.conceptGroup[0].conceptProperties;

        if (rxnormConcept && rxnormConcept.length > 1 && optionsCopy.path.endsWith('=MIN')) {
            optionsCopy.arrIN.push(rxnormCode);
        } else if ((rxnormConcept && rxnormConcept.length > 1) ||
            (!rxnormConcept && optionsCopy.path.endsWith('=IN'))) {
            console.log(`ERROR: Rxnorm API, path=${optionsCopy.path}`);
        } else if (rxnormConcept) {
            optionsCopy.rxnormCodes = saveMedName(optionsCopy, rxnormConcept[0].name, rxnormCode);
        } else {
            optionsCopy.codesToLookup.push(rxnormCode);
        }
    });
    return optionsCopy;
}

function updateRxnormCodes(rxnormCodes, newCode, oldCode) {
    const newKey = lib.toTitleCase(newCode);
    const rxnormCodesCopy = lib.setInitialObjValue(rxnormCodes, newKey, 0);
    rxnormCodesCopy[newKey] += rxnormCodesCopy[oldCode];
    delete rxnormCodesCopy[oldCode];
    return rxnormCodesCopy;
}

function saveMedName(options, medName, rxnormCode) {
    const optionsCopy = JSON.parse(JSON.stringify(options));
    optionsCopy.cache[rxnormCode] = lib.toTitleCase(medName);
    return updateRxnormCodes(optionsCopy.rxnormCodes, medName, rxnormCode);
}

function saveMedData(medNames) {
    const labelsAndValues = lib.sortKeyValuePairs(medNames.rxnormCodes, config.TOP_MEDS_AMOUNT);
    const dataToSave = {
        'medLabels': labelsAndValues[0],
        'medValues': labelsAndValues[1],
    };
    lib.saveDataToFile(config.DATA_FILE_PATH, dataToSave);
    lib.saveDataToFile(config.RXNORM_FILE_PATH, medNames.cache);
}

module.exports = {
    aggregate,
};
