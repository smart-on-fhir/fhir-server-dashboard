const fs = require('fs');
const config = require('./config');
const lib = require('./lib');
const medicationData = require('./medication_data');
const boxPlotResourceList = require('./box-plot-resource-list');
const APP = require("commander");
const PCG = require("../package.json");

/**
 * Clears the data.json file and starts to aggregate the data on the FHIR server
 */
function aggregate() {
    if (!fs.existsSync(APP.outputFile)) {
        fs.closeSync(fs.openSync(APP.outputFile, 'w'));
    }
    fs.writeFileSync(APP.outputFile, '{"tags": []}');
    lib.getAllResources(lib.buildFhirURL(APP.server, 'Patient', ['_count=50']), handlePatientData);
    getDataForResourceTable(config.TAGS);
}

/**
 * Aggregates the patient data and saves it to the data.json file
 * @param {Object[]} data all of the FHIR Patient resources in the server
 */
function handlePatientData(data) {
    const allPatientData = data.map(element => getPatientData(element.resource));

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
    allPatientData.forEach((patient) => stats = updatePatientStats(stats, patient));

    const saveValues = [stats.pyramidData, stats.states, stats.fAliveArr, stats.mAliveArr]
        .concat(lib.sortKeyValuePairs(stats.fRaces)).concat(lib.sortKeyValuePairs(stats.fEths))
        .concat(lib.sortKeyValuePairs(stats.mRaces)).concat(lib.sortKeyValuePairs(stats.mEths));
    const saveLabels = ['pyramidData', 'states', 'fAliveArr', 'mAliveArr',
        'fRaceLabels', 'fRaceValues', 'fEthLabels', 'fEthValues',
        'mRaceLabels', 'mRaceValues', 'mEthLabels', 'mEthValues'];

    const dataToSave = {};
    saveLabels.forEach((label, index) => dataToSave[label] = saveValues[index]);
    lib.saveDataToFile(APP.outputFile, dataToSave);
}

/**
 * Condenses a patient resource into an object containing the information needed for aggregation
 * @param {Object} resource a FHIR Patient resource
 * @returns {Object} a simple object containing the needed information of a patient
 */
function getPatientData(resource) {
    const patientData = { gender: (resource.gender ? resource.gender.toLowerCase() : null), };
    const state = lib.checkPath(resource, ['address', 0, 'state']);
    if (state) patientData.state = abbrState(state);
    if (resource.birthDate) patientData.birthDate = resource.birthDate;
    patientData.isAlive = !(resource.deceasedDateTime || resource.deceasedBoolean);
    patientData.races = getDemographicData('race', resource);
    patientData.eths = getDemographicData('ethnicity', resource);
    return patientData;
}

/**
 * Gets and returns an array containing the races/ethnicities of a patient
 * @param {String} type the type of demographic data to find (either 'race' or 'ethnicity')
 * @param {Object} resource a FHIR Patient resource
 * @returns {String[]} the races/ethnicities of a patient
 */
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

/**
 * Parses a Patient Resource Extension to find the relevant demographic data inside of it
 * @param {String} type the type of demographic data to find (either 'race' or 'ethnicity')
 * @param {Object} data a Patient Resource Extension
 * @returns {String[]} the races/ethnicities from the given data
 */
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

/**
 * Creates a blank template for the population pyramid
 * @returns {Object} a template object for the population pyramid
 */
function blankPyramidTemplate() {
    const pyramidGroups = ['0-4', '5-9', '10-14', '15-19', '20-24',
        '25-29', '30-34', '35-39', '40-44', '45-49', '50-54', '55-59', '60-64',
        '65-69', '70-74', '75-79', '80-84', '85-89', '90-94', '95-99', '100+'];
    return pyramidGroups.map(group => ({ male: 0, female: 0, group, }));
}

/**
 * Updates the aggregated patient data from a condensed FHIR Patient resource
 * @param {Object} stats the aggregated patient data
 * @param {Object} patient info about a patient (the return value of 'getPatientData')
 * @returns {Object} the updated aggregated patient data
 */
function updatePatientStats(stats, patient) {
    const statsCopy = JSON.parse(JSON.stringify(stats));
    if (patient.state) statsCopy.states = lib.addValuesToObj(statsCopy.states, [patient.state]);

    if (patient.gender !== 'female' && patient.gender !== 'male') return statsCopy;
    const prefix = patient.gender.charAt(0);
    statsCopy[`${prefix}AliveArr`][patient.isAlive ? 0 : 1] += 1;
    statsCopy[`${prefix}Races`] = lib.addValuesToObj(statsCopy[`${prefix}Races`], patient.races);
    statsCopy[`${prefix}Eths`] = lib.addValuesToObj(statsCopy[`${prefix}Eths`], patient.eths);
    if (patient.birthDate) {
        const age = getAgeFromBirthday(patient.birthDate, new Date());
        statsCopy.pyramidData = updatePyramidData(statsCopy.pyramidData, age, patient.gender);
    }
    return statsCopy;
}

/**
 * Calculates the age of a patient based on their birthday
 * @param {String} birthString a patient's birthday in the format yyyy-mm-dd
 * @param {Date} currentDate the current time and date
 * @returns {Number} the age of a patient with the birthday corresponding to the 'birthString' param
 */
function getAgeFromBirthday(birthString, currentDate) {
    const dateComponents = birthString.split('-').map(Number);
    const birthDate = new Date(dateComponents[0], dateComponents[1] - 1, dateComponents[2]);
    const millisecondsInYear = 31536000000;
    return Math.floor((currentDate.getTime() - birthDate.getTime()) / millisecondsInYear);
}

/**
 * Updates the data for the population pyramid based on a new patient's age and gender
 * @param {Object} pyramidData the data for the population pyramid
 * @param {Number} age the age of the patient to add
 * @param {String} gender the gender of the patient to add, either 'male' or 'female'
 * @returns {Object} the updated data for the population pyramid
 */
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

/**
 * Returns the abbreviation of the given state
 * @param {String} fullStateName the full name of a state in the US
 * @returns {String} the abbreviation of the given state
 */
function abbrState(fullStateName) {
    if (fullStateName.length === 2) return fullStateName.toUpperCase();
    const allStates = [['Arizona', 'AZ'], ['Alabama', 'AL'], ['Alaska', 'AK'], ['Arizona', 'AZ'], ['Arkansas', 'AR'], ['California', 'CA'], ['Colorado', 'CO'], ['Connecticut', 'CT'], ['Delaware', 'DE'], ['Florida', 'FL'], ['Georgia', 'GA'], ['Hawaii', 'HI'], ['Idaho', 'ID'], ['Illinois', 'IL'], ['Indiana', 'IN'], ['Iowa', 'IA'], ['Kansas', 'KS'], ['Kentucky', 'KY'], ['Kentucky', 'KY'], ['Louisiana', 'LA'], ['Maine', 'ME'], ['Maryland', 'MD'], ['Massachusetts', 'MA'], ['Michigan', 'MI'], ['Minnesota', 'MN'], ['Mississippi', 'MS'], ['Missouri', 'MO'], ['Montana', 'MT'], ['Nebraska', 'NE'], ['Nevada', 'NV'], ['New Hampshire', 'NH'], ['New Jersey', 'NJ'], ['New Mexico', 'NM'], ['New York', 'NY'], ['North Carolina', 'NC'], ['North Dakota', 'ND'], ['Ohio', 'OH'], ['Oklahoma', 'OK'], ['Oregon', 'OR'], ['Pennsylvania', 'PA'], ['Rhode Island', 'RI'], ['South Carolina', 'SC'], ['South Dakota', 'SD'], ['Tennessee', 'TN'], ['Texas', 'TX'], ['Utah', 'UT'], ['Vermont', 'VT'], ['Virginia', 'VA'], ['Washington', 'WA'], ['West Virginia', 'WV'], ['Wisconsin', 'WI'], ['Wyoming', 'WY']]; // eslint-disable-line max-len
    const matchedState = allStates.filter(state => state[0] === lib.toTitleCase(fullStateName));
    return lib.checkPath(matchedState, [0, 1]);
}

/**
* Aggregates the condition data and saves it to the data.json file
* @param {Object[]} data all of the FHIR Condition resources in the server
*/
function handleConditionData(data) {
    // Creates an object with the format: {'patient-id': [conditions, that, the, patient, has]}
    const consByPatient = data.reduce((obj, element) => {
        return updateConditionStats(obj, element.resource);
    }, {});

    // Creates an object with the format: {'condition': number-of-patients-with-condition}
    const conditionCounts = Object.values(consByPatient).reduce((obj, conditions) => {
        return lib.addValuesToObj(obj, conditions);
    }, {});

    // conLabels contains the top conditions in the server (length = config.CONDITION_MATRIX_LENGTH)
    const conLabels = lib.sortKeyValuePairs(conditionCounts, config.CONDITION_MATRIX_LENGTH)[0];

    // Removes every condition in consByPatient that is not in conLabels
    Object.keys(consByPatient).forEach((patient) => {
        consByPatient[patient] = consByPatient[patient].filter(con => conLabels.includes(con));
    });

    /**
     * Creates a 2D array of values for the condition co-morbidity matrix
     * Each inner array represents a row in the matrix
     * Each value represents the number of patients with two of the top conditions
     */
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
    lib.saveDataToFile(APP.outputFile, dataToSave);
}

/**
 * Updates the aggregated condition data based on a new condition resource
 * @param {Object} conditions an object that keeps track of each patient's conditions
 * @param {Object} resource a FHIR Condition resource
 * @returns {Object} the updated 'conditions' object with the new info from the 'resource' param
 */
function updateConditionStats(conditions, resource) {
    const patient = resource.patient || resource.subject;
    let condition = resource.code;
    if (!condition || resource.clinicalStatus !== 'active' || !patient) return conditions;

    condition = condition.text || lib.checkPath(condition, ['coding', 0, 'display']);
    if (!condition) return conditions;

    return lib.pushStringToObj(conditions, patient.reference, lib.toTitleCase(condition));
}

/**
 * Aggregates and saves the data for the resource counts table
 * @param {String[]} tags the tags on the server to include in the resource counts table
 */
function getDataForResourceTable(tags) {
    lib.httpRequest(lib.buildFhirURL(APP.server, 'metadata', []), (result) => {
        lib.saveDataToFile(APP.outputFile, { 'metadata': getMetadataInfo(result), });

        const fhirVersion = result.fhirVersion || 'Not Provided';
        medicationData.aggregate(APP, fhirVersion);

        const serverResourceList = lib.checkPath(result, ['rest', 0, 'resource']);
        if (!serverResourceList) return;

        // Creates a list of resources that are supported by the server and searchable/accessible
        let resourcesSupported = serverResourceList.filter((resource) => {
            return resource.interaction && resource.interaction.some(i => i.code === 'search-type');
        }).map(resource => resource.type);

        // Gets the total resource counts (includes all tags and resources without a tag)
        new Promise(resolve => getResourceCounts(resourcesSupported, config.ALL_TAGS, resolve))
            .then((serverCounts) => {
                let totalCounts = serverCounts.filter(value => value && value !== '0');
                resourcesSupported = resourcesSupported.filter((resource, index) => {
                    return serverCounts[index] && serverCounts[index] !== '0';
                });

                // Gets the resource counts for each tag
                const allTagCounts = tags.map((tag) => {
                    return new Promise(done => getResourceCounts(resourcesSupported, tag, done));
                });

                Promise.all(allTagCounts).then((resourceCounts) => {
                    resourceCounts.push(totalCounts);
                    const resourceLabels = resourcesSupported.concat([config.TABLE_LAST_ROW_LABEL]);
                    const dataToSave = { tags, resourceLabels, resourceCounts, };
                    lib.saveDataToFile(APP.outputFile, dataToSave);

                    totalCounts = totalCounts.map(num => parseInt(num.replace(/,/g, '')));
                    getDataForBoxPlots(resourcesSupported, totalCounts, fhirVersion);
                });
            });
    });
}

/**
 * Finds the number of resources in the server of each resource from the 'resources' parameter
 * @param {String[]} resources a list of resources to find the counts of
 * @param {String} tag the tag to query for the counts, if empty queries the entire server
 * @param {Function} resolve the function that returns the 'counts' data to an outer promise
 * @param {Number[]} [counts=[]] will contain the count of each resource from the 'resources' param
 */
function getResourceCounts(resources, tag, resolve, counts = []) {
    if (resources.length === 0) {
        // Appends the total number of resources found (for the last row of the table)
        counts.push(counts.reduce((sum, value) => sum + value, 0));
        const formattedValues = counts.map(num => num.toLocaleString()).concat([tag]);
        resolve(formattedValues);
        return;
    }
    const params = ['_summary=count'];
    if (tag !== config.ALL_TAGS) params.push(`_tag=${tag}`);
    lib.httpRequest(lib.buildFhirURL(APP.server, resources[0], params), (response) => {
        getResourceCounts(resources.slice(1), tag, resolve, counts.concat([response.total]));
    });
}

/**
 * Aggregates the necessary data for the box plots
 * @param {String[]} resourceLabels all of the resources in the server
 * @param {Number[]} resCounts the counts of all of the resources in the server
 * @param {String} fhirVersion the FHIR version of the server
 */
function getDataForBoxPlots(resourceLabels, resCounts, fhirVersion) {
    if (!resourceLabels.includes('Patient')) return;
    const numPatients = resCounts[resourceLabels.indexOf('Patient')];

    // A list of resources that can be used for box plots (from box-plot-resource-list.js)
    const resList = (fhirVersion.charAt(0) === '3' || fhirVersion === 'Not Provided')
        ? boxPlotResourceList.STU3 : boxPlotResourceList.DSTU2;

    // Finds the resources to make into box plots
    const arr = resCounts.slice(0, resCounts.length - 2).map((val, i) => [resourceLabels[i], val]);
    const resourcesToPlot = lib.sortKeyValuePairs(arr)[0].filter(res => resList.includes(res));
    resourcesToPlot.length = Math.min(resourcesToPlot.length, config.BOX_PLOT_AMOUNT);

    if (!resourcesToPlot.includes('Condition')) {
        lib.getAllResources(lib.buildFhirURL(APP.server, 'Condition', ['_count=50']), handleConditionData);
    }

    const boxPlotPromises = resourcesToPlot.map(resource => getBoxPlotPromise(resource));
    Promise.all(boxPlotPromises).then(boxPlotData => saveBoxPlotData(boxPlotData, numPatients));
}

/**
 * Creates a promise that will return the data for a box plot for the given resource
 * @param {String} resource the type of resource
 * @returns {Promise} a promise that will return data for a box plot
 */
function getBoxPlotPromise(resource) {
    return new Promise((resolve) => {
        lib.getAllResources(lib.buildFhirURL(APP.server, resource, ['_count=50']), (result) => {
            const resourceType = result[0].resource.resourceType;
            if (resourceType === 'Condition') handleConditionData(result);

            /**
             * Creates an object with the format:
             * {'patient-id': 'number of resources with type `resource` this patient has'}
             */
            const patientsWithResource = result.reduce((acc, element) => {
                const id = element.resource.subject || element.resource.patient;
                if (!id || !id.reference) return acc;
                return lib.addValuesToObj(acc, [id.reference.split('ent/')[1]]);
            }, { resource: resourceType, });

            resolve(patientsWithResource);
        });
    });
}

/**
 * Saves the necessary data to make the box plots to the data.json file
 * @param {Object[]} boxPlotData objects that each contain data for a box plot
 * @param {Number} numPatients the number of patients on the server
 */
function saveBoxPlotData(boxPlotData, numPatients) {
    const dataToSave = boxPlotData.map((data) => {
        let boxPlotValues = Object.values(data).filter(value => !isNaN(value));

        // Adds an array of 0's with length = num patients with no resource of type 'data.resource'
        boxPlotValues = boxPlotValues.concat(Array(numPatients - boxPlotValues.length).fill(0));

        if (boxPlotValues.filter(value => value > 0).length === 0) return;
        return { resource: data.resource, data: boxPlotValues, };
    });
    lib.saveDataToFile(APP.outputFile, { 'boxPlotData': dataToSave, });
}

/**
 * Creates a simple condensed overview of a server given its metadata
 * @param {Object} data the metadata of the FHIR server
 * @returns {Object} a simple condensed overview of the server's metadata
 */
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
        url: APP.server,
        timestamp: getCurrentTime(),
        fhirVersion: data.fhirVersion || 'Not Provided',
        supports,
    };
}

/**
 * Creates a timestamp containing the current date and time
 * @returns {String} the current date and time
 */
function getCurrentTime() {
    const now = new Date();
    const day = `${formatTime(1 + now.getMonth())}/${formatTime(now.getDate())}`;
    const time = `${formatTime(now.getHours())}:${formatTime(now.getMinutes())}`;
    return `${day}/${now.getFullYear()} ${time}`;
}

/**
 * Puts a 0 in front of a number if it only contains one digit
 * @param {Number} num the number to format
 * @returns {String} a string with 0 as the first character if the 'num' param contained one digit
 */
function formatTime(num) {
    const str = num.toString();
    return str.length > 1 ? str : `0${str}`;
}

// Run ==================================================================================

APP.version(PCG.version)
    .option('-s, --server <url>', 'The target fhir server url', config.SERVER)
    .option('-o, --output-file <file>', 'The output JSON file', config.DATA_FILE_PATH)
    .parse(process.argv);

if (!APP.server || APP.server.trim() === '') {
    throw new Error('Invalid server URL.');
}

if (!APP.server.endsWith('/')) APP.server = `${APP.server}/`;
if (!APP.outputFile.startsWith('./client/')) APP.outputFile = `./client/${APP.outputFile}`;
if (!APP.outputFile.endsWith('.json')) APP.outputFile = `${APP.outputFile}.json`;

aggregate();
