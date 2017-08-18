const fs = require('fs');
const config = require('./config');
const lib = require('./lib');
let APP = {};

/**
 * Starts to aggregate the medication data
 * @param {Object} app an object containing the fhir server url and the data output file path
 * @param {String} fhirVersion the FHIR version of the server
 */
function aggregate(app, fhirVersion) {
    APP = app;

    const resource = fhirVersion.charAt(0) === '3' || fhirVersion === 'Not Provided'
        ? 'MedicationRequest' : 'MedicationOrder';

    lib.getAllResources(lib.buildFhirURL(APP.server, resource,
        [`_include=${resource}:medication`, '_count=50']), handleMedData);
}

/**
 * Analyzes the medication data and determines the quantity of each Rxnorm code that is present
 * @param {Object[]} data FHIR MedicationRequest/MedicationOrder/Medication resources
 */
function handleMedData(data) {
    /**
     * Creates an object with three sub-objects with the following formats:
     * rxnormCodes - {'rxnorm code from server': ['patient-ids', 'with', 'this', 'rxnorm code']}
     * medIDs - {'id of Medication resource': ['patient-ids', 'with', 'this', 'resource']}
     * medLookup - {'id of Medication resource': 'rxnorm code of the medication in this resource'}
     * 
     * medIDs and medLookup are only used when a MedicationRequest/MedicationOrder resource does
     * not contain a rxnorm code and instead contains a link to a Medication resource
     */
    const medData = data.reduce((acc, element) => {
        return updateMedData(acc, element.resource);
    }, { rxnormCodes: {}, medIDs: {}, medLookup: {}, });

    // Updates medData.rxnormCodes with the data from medData.medIDs and medData.medLookup
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

/**
 * Updates the aggregated medication data based on a new FHIR resource with medication information
 * @param {Object} medData the aggregated medication data
 * @param {Object} resource a MedicationRequest/MedicationOrder/Medication FHIR resource
 * @returns {Object} the updated aggregated medication data
 */
function updateMedData(medData, resource) {
    const dataCopy = JSON.parse(JSON.stringify(medData));
    if (resource.resourceType.endsWith('Request') || resource.resourceType.endsWith('Order')) {
        let patient = resource.subject || resource.patient;
        if (!patient || !patient.reference) return dataCopy;
        patient = patient.reference;

        const medCode = lib.checkPath(resource, ['medicationCodeableConcept', 'coding', 0, 'code']);
        if (medCode) {
            // Gets rxnorm code from a MedicationRequest/MedicationOrder resource
            dataCopy.rxnormCodes = lib.pushStringToObj(dataCopy.rxnormCodes, medCode, patient);
        } else if (lib.checkPath(resource, ['medicationReference', 'reference'])) {
            /**
             * No rxnorm code in this MedicationRequest/MedicationOrder resource,
             * so instead we use the link to a Medication resource
             */
            const medID = resource.medicationReference.reference.split('on/')[1];
            dataCopy.medIDs = lib.pushStringToObj(dataCopy.medIDs, medID, patient);
        }
    } else if (lib.checkPath(resource, ['code', 'coding', 0, 'code'])) {
        // Gets rxnorm code from a Medication resource
        dataCopy.medLookup[resource.id] = resource.code.coding[0].code;
    }
    return dataCopy;
}

/**
 * Looks up each Rxnorm code in a previously defined cache to minimize the number of calls to the
 * Rxnorm API. For the Rxnorm codes not in the cache, calls the API to find out the medication names
 * and saves the resulting data to the data.json file
 * @param {Object} rxnormCodes the quantity of each Rxnorm code in the server
 */
function handleRxnormCodes(rxnormCodes) {
    let rxnormCodesCopy = JSON.parse(JSON.stringify(rxnormCodes));
    const rxnormLookup = JSON.parse(fs.readFileSync(config.RXNORM_FILE_PATH).toString());
    const notInLookup = [];

    // Uses the cache (stored in rxnorm.json) to optimize efficiency
    Object.keys(rxnormCodesCopy).forEach((code) => {
        // Now the rxnormCodes object has this format: {'code': num-patients-using-this-med-code}
        rxnormCodesCopy[code] = rxnormCodesCopy[code].length;

        const lookup = rxnormLookup[code];
        if (lookup === 'Delete') {
            // Deletes a code that is retired, unknown or alien
            delete rxnormCodesCopy[code];
        } else if (lookup && isNaN(lookup)) {
            // Successfully finds a med name for the rxnorm code in the cache
            rxnormCodesCopy = updateRxnormCodes(rxnormCodesCopy, code, lookup);
        } else if (lookup && !isNaN(lookup) && isNaN(rxnormLookup[lookup])) {
            // Successfully finds a med name for a re-mapped rxnorm code in the cache
            rxnormCodesCopy = updateRxnormCodes(rxnormCodesCopy, code, rxnormLookup[lookup]);
        } else {
            // Didn't find anything in the cache for the rxnorm code, so must use the rxnorm API
            notInLookup.push(code);
        }
    });
    const rxnormURL = (tty) => `/related.json?tty=${tty}IN`;
    const options = {
        rxnormCodes: rxnormCodesCopy,
        codesToLookup: notInLookup,
        /**
         * options.paths represents the different API calls that need to be made
         * (in the correct order) for each code in codesToLookup
         */
        paths: ['/status.json', rxnormURL('M'), rxnormURL('P'), rxnormURL('')],
        arrIN: [],
        cache: {},
    };
    new Promise(done => getMedNames(options, done)).then(medNames => saveMedData(medNames));
}

/**
 * Finds the corresponding medication name for each Rxnorm code in the server
 * @param {Object} options contains the aggregated med data and the data to call the Rxnorm API
 * @param {Function} done the function that returns the medication names to an outer promise
 */
function getMedNames(options, done) {
    /**
     * Upon each iteration of this function, more and more codes in options.rxnormCodes get
     * switched to their corresponding medication names (which are found from the Rxnorm API)
     */
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

/**
 * Calls the Rxnorm API to find the status or medication name of an Rxnorm code
 * @param {Object} options contains the aggregated med data and the data to call the Rxnorm API
 * @param {Function} resolve the function that returns the resulting data to an outer promise
 */
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

    // After all of the promises are done, options.results has this format: {'code': API response}

    Promise.all(rxnormPromises).then(() => {
        optionsCopy.codesToLookup = [];
        const callbackFunc = options.path === '/status.json' ? handleRxnormStatus : parseRxnormData;
        resolve(callbackFunc(optionsCopy));
    });
}

/**
 * Handles the statuses of the Rxnorm codes
 * @param {Object} options contains the API responses about the statuses of the Rxnorm codes
 * @returns {Object} an updated copy of the 'options' parameter which takes into account the
 * statuses of the Rxnorm codes
 */
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

/**
 * Parses the API responses that contain the Rxnorm codes' medication names
 * @param {Object} options contains the API responses about the medication names of Rxnorm codes
 * @returns {Object} an updated copy of the 'options' parameter which takes the medication names
 * of the Rxnorm codes into account
 */
function parseRxnormData(options) {
    const optionsCopy = JSON.parse(JSON.stringify(options));
    if (optionsCopy.path.endsWith('=PIN')) {
        optionsCopy.codesToLookup = optionsCopy.arrIN;
    }
    Object.keys(optionsCopy.result).forEach((rxnormCode) => {
        const rxnormConcept = optionsCopy.result[rxnormCode]
            .relatedGroup.conceptGroup[0].conceptProperties;

        if (optionsCopy.path.endsWith('=MIN') && rxnormConcept && rxnormConcept.length > 1) {
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

/**
 * Changes a key in the given 'rxnormCodes' object to a new key
 * @param {Object} rxnormCodes the quantity of each Rxnorm code in the server
 * @param {String} oldKey the key in the 'rxnormCodes' object to overwrite with a new key
 * @param {String} newKey the string with which to overwrite a key in the 'rxnormCodes' object
 * @returns {Object} the updated 'rxnormCodes' object with the new key and without the old key
 */
function updateRxnormCodes(rxnormCodes, oldKey, newKey) {
    const newFormattedKey = lib.toTitleCase(newKey);
    const rxnormCodesCopy = lib.setInitialObjValue(rxnormCodes, newFormattedKey, 0);
    rxnormCodesCopy[newFormattedKey] += rxnormCodesCopy[oldKey];
    delete rxnormCodesCopy[oldKey];
    return rxnormCodesCopy;
}

/**
 * Changes the reference of a Rxnorm code in the 'rxnormCodes' object to a new key (either a
 * medication name or a new active code) and saves it in the cache for future use
 * @param {Object} options the object that contains data about the Rxnorm codes and a cache object
 * to minimize the number of calls to the Rxnorm API in the future
 * @param {String} medName the medication name (or new code) to replace the current Rxnorm code
 * @param {String} rxnormCode the current Rxnorm code that will be replaced by 'medName'
 * @returns {Object} a copy of the 'options' object with updated 'cache' and 'rxnormCodes' objects
 */
function saveMedName(options, medName, rxnormCode) {
    const optionsCopy = JSON.parse(JSON.stringify(options));
    optionsCopy.cache[rxnormCode] = lib.toTitleCase(medName);
    return updateRxnormCodes(optionsCopy.rxnormCodes, rxnormCode, medName);
}

/**
 * Saves the aggregated medication information to the data.json file
 * @param {Object} medNames the medication data to save to the data.json file
 */
function saveMedData(medNames) {
    const labelsAndValues = lib.sortKeyValuePairs(medNames.rxnormCodes, config.TOP_MEDS_AMOUNT);
    const dataToSave = {
        'medLabels': labelsAndValues[0],
        'medValues': labelsAndValues[1],
    };
    lib.saveDataToFile(APP.outputFile, dataToSave);
    lib.saveDataToFile(config.RXNORM_FILE_PATH, medNames.cache);
}

module.exports = {
    aggregate,
};
