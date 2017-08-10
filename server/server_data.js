const fs = require('fs');
const config = require('./config');
const lib = require('./lib');
const medicationData = require('./medication_data');
const boxPlotResourceList = require('./box-plot-resource-list');

function aggregate() {
    fs.writeFileSync(config.DATA_FILE_PATH, '{}');
    lib.getAllResources(lib.buildFhirURL('Patient', ['_count=50']), handlePatientData);
    // medicationData.aggregate('3');
}

function handlePatientData(data) {
    const allPatientData = data.map(element => getPatientData(element.resource));
    getDataForResourceTable(config.TAGS);
    savePatientData(allPatientData);
}

function getPatientData(resource) {
    const patientData = { gender: resource.gender.toLowerCase() || null, };
    const state = lib.checkPath(resource, ['address', 0, 'state']);
    if (state) patientData.state = abbrState(state);
    if (resource.birthDate) patientData.birthDate = resource.birthDate;
    patientData.isAlive = !(resource.deceasedDateTime || resource.deceasedBoolean);
    patientData.races = getDemographicData('race', resource);
    patientData.eths = getDemographicData('ethnicity', resource);
    return patientData;
}

function getDemographicData(type, resource) {
    let demographicData = [];
    if (!lib.checkPath(resource, ['extension', 0])) return ['Not Given'];
    resource.extension.forEach((extensionData) => {
        const newDemoData = parseDemographicData(type, extensionData);
        if (newDemoData.length === 0) return;
        demographicData = demographicData.concat(newDemoData);
    });
    return demographicData.length !== 0 ? demographicData : ['Not Given'];
}

function parseDemographicData(type, data) {
    const dataToReturn = [];
    if (!data.url || !data.url.endsWith(type)) return [];
    if (lib.checkPath(data, ['extension', 0])) {
        data.extension.forEach((item) => {
            const datum = lib.checkPath(item, ['valueCoding', 'display']) || item.valueString;
            if (datum) dataToReturn.push(datum);
        });
    } else {
        const datum = lib.checkPath(data, ['valueCoding', 'display'])
            || lib.checkPath(data, ['valueCodeableConcept', 'coding', 0, 'display']);
        if (datum) dataToReturn.push(datum);
    }
    return dataToReturn;
}

function savePatientData(allPatientData) {
    let stats = {
        fAliveArr: [0, 0],
        mAliveArr: [0, 0],
        fRaces: {},
        mRaces: {},
        fEths: {},
        mEths: {},
        pyramidData: blankPyramidTemplate(),
        states: {},
    };
    allPatientData.forEach((patient) => {
        if (patient.gender === 'female' || patient.gender === 'male') {
            stats = updatePatientStats(stats, patient);
        }
        if (patient.state) stats.states = lib.addValuesToObj(stats.states, [patient.state]);
    });
    const saveValues = [stats.pyramidData, stats.states, stats.fAliveArr, stats.mAliveArr]
        .concat(lib.sortKeyValuePairs(stats.fRaces)).concat(lib.sortKeyValuePairs(stats.fEths))
        .concat(lib.sortKeyValuePairs(stats.mRaces)).concat(lib.sortKeyValuePairs(stats.mEths));
    const saveLabels = ['pyramidData', 'states', 'fAliveArr', 'mAliveArr',
        'fRaceLabels', 'fRaceValues', 'fEthLabels', 'fEthValues',
        'mRaceLabels', 'mRaceValues', 'mEthLabels', 'mEthValues'];
    const dataToSave = {};
    saveLabels.forEach((label, index) => {
        dataToSave[label] = saveValues[index];
    });
    lib.saveDataToFile(config.DATA_FILE_PATH, dataToSave);
}

function blankPyramidTemplate() {
    const pyramidGroups = ['0-4', '5-9', '10-14', '15-19', '20-24',
        '25-29', '30-34', '35-39', '40-44', '45-49', '50-54', '55-59', '60-64',
        '65-69', '70-74', '75-79', '80-84', '85-89', '90-94', '95-99', '100+'];
    return pyramidGroups.map(group => ({ male: 0, female: 0, group, }));
}

function updatePatientStats(stats, patient) {
    const statsCopy = JSON.parse(JSON.stringify(stats));
    const prefix = patient.gender.charAt(0);
    statsCopy[`${prefix}AliveArr`][patient.isAlive ? 0 : 1] += 1;
    statsCopy[`${prefix}Races`] = lib.addValuesToObj(statsCopy[`${prefix}Races`], patient.races);
    statsCopy[`${prefix}Eths`] = lib.addValuesToObj(statsCopy[`${prefix}Eths`], patient.eths);
    if (patient.birthDate) {
        const age = getPatientAge(patient.birthDate, new Date());
        statsCopy.pyramidData = updatePyramidData(statsCopy.pyramidData, age, patient.gender);
    }
    return statsCopy;
}

function getPatientAge(birthString, currentDate) {
    const dateComponents = birthString.split('-');
    const birthDate = new Date(dateComponents[0], dateComponents[1] - 1, dateComponents[2]);
    const millisecondsInYear = 31536000000;
    return Math.floor((currentDate.getTime() - birthDate.getTime()) / millisecondsInYear);
}

function updatePyramidData(pyramidData, age, gender) {
    const copiedPyramidData = pyramidData.map(group => Object.assign({}, group));
    let updated = false;
    copiedPyramidData.forEach((ageGroup) => {
        if (updated) return;
        const ageBounds = ageGroup.group.split('-').map(parseFloat);
        if (ageGroup.group === '100+' && age >= 100 || age >= ageBounds[0] && age <= ageBounds[1]) {
            ageGroup[gender] += 1;
            updated = true;
        }
    });
    return copiedPyramidData;
}

function abbrState(input) {
    if (input.length === 2) return input.toUpperCase();
    const allStates = [['Arizona', 'AZ'], ['Alabama', 'AL'], ['Alaska', 'AK'], ['Arizona', 'AZ'], ['Arkansas', 'AR'], ['California', 'CA'], ['Colorado', 'CO'], ['Connecticut', 'CT'], ['Delaware', 'DE'], ['Florida', 'FL'], ['Georgia', 'GA'], ['Hawaii', 'HI'], ['Idaho', 'ID'], ['Illinois', 'IL'], ['Indiana', 'IN'], ['Iowa', 'IA'], ['Kansas', 'KS'], ['Kentucky', 'KY'], ['Kentucky', 'KY'], ['Louisiana', 'LA'], ['Maine', 'ME'], ['Maryland', 'MD'], ['Massachusetts', 'MA'], ['Michigan', 'MI'], ['Minnesota', 'MN'], ['Mississippi', 'MS'], ['Missouri', 'MO'], ['Montana', 'MT'], ['Nebraska', 'NE'], ['Nevada', 'NV'], ['New Hampshire', 'NH'], ['New Jersey', 'NJ'], ['New Mexico', 'NM'], ['New York', 'NY'], ['North Carolina', 'NC'], ['North Dakota', 'ND'], ['Ohio', 'OH'], ['Oklahoma', 'OK'], ['Oregon', 'OR'], ['Pennsylvania', 'PA'], ['Rhode Island', 'RI'], ['South Carolina', 'SC'], ['South Dakota', 'SD'], ['Tennessee', 'TN'], ['Texas', 'TX'], ['Utah', 'UT'], ['Vermont', 'VT'], ['Virginia', 'VA'], ['Washington', 'WA'], ['West Virginia', 'WV'], ['Wisconsin', 'WI'], ['Wyoming', 'WY']]; // eslint-disable-line max-len
    const matchedState = allStates.filter(state => state[0] === lib.toTitleCase(input));
    return lib.checkPath(matchedState, [0, 1]);
}

function handleConditionData(data) {
    const consByPatient = data.reduce((obj, element) => {
        return updateConditionStats(obj, element.resource);
    }, {});

    const conditionCounts = Object.values(consByPatient).reduce((obj, conditions) => {
        return lib.addValuesToObj(obj, conditions);
    }, {});

    const conLabels = lib.sortKeyValuePairs(conditionCounts, config.CONDITION_MATRIX_LENGTH)[0];
    Object.keys(consByPatient).forEach((patient) => {
        consByPatient[patient] = consByPatient[patient].filter(con => conLabels.includes(con));
    });

    const conditionMatrixValues = conLabels.reduce((matrix, con1) => {
        const matrixRowValues = conLabels.reduce((row, con2) => {
            const numInMatrix = Object.keys(consByPatient).filter((id) => {
                return consByPatient[id].includes(con1) && consByPatient[id].includes(con2);
            }).length;
            return row.concat([numInMatrix]);
        }, []);
        return matrix.concat([matrixRowValues]);
    }, []);

    const dataToSave = { 'conditionMatrixLabels': conLabels, conditionMatrixValues, };
    lib.saveDataToFile(config.DATA_FILE_PATH, dataToSave);
}

function updateConditionStats(conStats, resource) {
    const patient = resource.patient || resource.subject;
    let condition = resource.code;
    if (!condition || resource.clinicalStatus !== 'active' || !patient) return conStats;

    condition = condition.text || lib.checkPath(condition, ['coding', 0, 'display']);
    if (!condition) return conStats;

    return lib.pushStringToObj(conStats, patient.reference, lib.toTitleCase(condition));
}

function getDataForResourceTable(tags) {
    lib.httpRequest(lib.buildFhirURL('metadata', []), (result) => {
        lib.saveDataToFile(config.DATA_FILE_PATH, { 'metadata': getMetadataInfo(result), });

        const fhirVersion = result.fhirVersion || 'Not Provided';
        medicationData.aggregate(fhirVersion);

        const serverResourceList = lib.checkPath(result, ['rest', 0, 'resource']);
        if (!serverResourceList) return;

        let resourcesSupported = serverResourceList.filter((resource) => {
            return resource.interaction && resource.interaction.some(i => i.code === 'search-type');
        }).map(resource => resource.type);

        new Promise(resolve => getResourceCounts(resourcesSupported, config.ALL_TAGS, resolve))
            .then((serverCounts) => {
                let totalCounts = serverCounts.filter(value => value && value !== '0');
                resourcesSupported = resourcesSupported.filter((resource, index) => {
                    return serverCounts[index] && serverCounts[index] !== '0';
                });

                const allTagCounts = tags.map((tag) => {
                    return new Promise(done => getResourceCounts(resourcesSupported, tag, done));
                });

                Promise.all(allTagCounts).then((resourceCounts) => {
                    resourceCounts.push(totalCounts);
                    const resourceLabels = resourcesSupported.concat([config.TABLE_LAST_ROW_LABEL]);
                    const dataToSave = { tags, resourceLabels, resourceCounts, };
                    lib.saveDataToFile(config.DATA_FILE_PATH, dataToSave);

                    totalCounts = totalCounts.map(num => parseInt(num.replace(/,/g, '')));
                    getDataForBoxPlots(resourcesSupported, totalCounts, fhirVersion);
                });
            });
    });
}

function getResourceCounts(resources, tag, resolve, counts = []) {
    if (resources.length === 0) {
        counts.push(counts.reduce((sum, value) => sum + value, 0));
        const formattedValues = counts.map(num => num.toLocaleString()).concat([tag]);
        resolve(formattedValues);
        return;
    }
    const params = ['_summary=count'];
    if (tag !== config.ALL_TAGS) params.push(`_tag=${tag}`);
    lib.httpRequest(lib.buildFhirURL(resources[0], params), (response) => {
        getResourceCounts(resources.slice(1), tag, resolve, counts.concat([response.total]));
    });
}

function getDataForBoxPlots(resourceLabels, resCounts, fhirVersion) {
    if (!resourceLabels.includes('Patient')) return;
    const numPatients = resCounts[resourceLabels.indexOf('Patient')];

    const resList = (fhirVersion.charAt(0) === '3' || fhirVersion === 'Not Provided')
        ? boxPlotResourceList.STU3 : boxPlotResourceList.DSTU2;

    const arr = resCounts.slice(0, resCounts.length - 2).map((val, i) => [resourceLabels[i], val]);
    const resourcesToPlot = lib.sortKeyValuePairs(arr)[0].filter(res => resList.includes(res));
    resourcesToPlot.length = Math.min(resourcesToPlot.length, config.BOX_PLOT_AMOUNT);

    const index = resourcesToPlot.indexOf('Observation'); // DELETE BEFORE DEPLOYMENT
    if (index > -1) resourcesToPlot.splice(index, 1);

    if (!resourcesToPlot.includes('Condition')) {
        lib.getAllResources(lib.buildFhirURL('Condition', ['_count=50']), handleConditionData);
    }

    const boxPlotPromises = resourcesToPlot.map(resource => getBoxPlotPromise(resource));
    Promise.all(boxPlotPromises).then(boxPlotData => saveBoxPlotData(boxPlotData, numPatients));
}

function getBoxPlotPromise(resource) {
    return new Promise((resolve) => {
        lib.getAllResources(lib.buildFhirURL(resource, ['_count=50']), (result) => {
            const resourceType = result[0].resource.resourceType;
            if (resourceType === 'Condition') handleConditionData(result);

            const patientsWithResource = result.reduce((acc, element) => {
                const id = element.resource.subject || element.resource.patient;
                if (!id || !id.reference) return acc;
                return lib.addValuesToObj(acc, [id.reference.split('ent/')[1]]);
            }, { resource: resourceType, });

            resolve(patientsWithResource);
        });
    });
}

function saveBoxPlotData(boxPlotData, numPatients) {
    const dataToSave = boxPlotData.map((data) => {
        let boxPlotValues = Object.values(data).filter(value => !isNaN(value));
        boxPlotValues = boxPlotValues.concat(Array(numPatients - boxPlotValues.length).fill(0));
        if (boxPlotValues.filter(value => value > 0).length === 0) return;
        return { resource: data.resource, data: boxPlotValues, };
    });
    lib.saveDataToFile(config.DATA_FILE_PATH, { 'boxPlotData': dataToSave, });
}

function getMetadataInfo(data) {
    const sof = lib.checkPath(data, ['rest', 0, 'security', 'service', 0, 'coding', 0, 'code']);
    const supports = {
        smartOnFhir: sof ? sof.toLowerCase() === 'smart-on-fhir' : false,
        json: false,
        xml: false,
    };
    if (lib.checkPath(data, ['format', 0])) {
        data.format.forEach((formatSupported) => {
            supports.json = supports.json || formatSupported.toLowerCase().includes('json');
            supports.xml = supports.xml || formatSupported.toLowerCase().includes('xml');
        });
    }
    return {
        url: config.SERVER,
        timestamp: getCurrentTime(),
        fhirVersion: data.fhirVersion || 'Not Provided',
        supports,
    };
}

function getCurrentTime() {
    const now = new Date();
    const day = `${formatTime(1 + now.getMonth())}/${formatTime(now.getDate())}`;
    const time = `${formatTime(now.getHours())}:${formatTime(now.getMinutes())}`;
    return `${day}/${now.getFullYear()} ${time}`;
}

function formatTime(num) {
    const str = num.toString();
    return str.length > 1 ? str : `0${str}`;
}

module.exports = {
    aggregate,
};
