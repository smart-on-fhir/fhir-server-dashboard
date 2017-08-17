const request = require('request');
const config = require('./config');
const fs = require('fs');

/**
 * Executes a GET request to the given URL and calls a callback function with the request's response
 * @param {String} url the URL from which to get data via a GET request
 * @param {Function} callback the callback function that is given the request's response
 */
function httpRequest(url, callback) {
    request({ url, json: true, headers: { accept: 'application/json', }, }, (error, res, json) => {
        if (error) throw error;
        if (res.statusCode >= 400) throw new Error(res.statusMessage);

        callback(json);
    });
}

/**
 * Creates a URL to query a FHIR server
 * @param {String} path the path of the query within the server, typically a FHIR resource
 * @param {String[]} params the parameters of the query
 * @returns {String} the built URL
 */
function buildFhirURL(path, params) {
    const parameters = params.reduce((sum, param) => `${sum + param}&`, '');
    const server = config.SERVER.endsWith('/') ? config.SERVER : `${config.SERVER}/`;
    return `${server + path}?${parameters}_format=json`;
}

/**
 * Gathers an array containing all of the FHIR resources of a specific type from a server
 * @param {String} url the URL that houses the desired resource type
 * @param {Function} callback the callback function that is given the array of resources
 * @param {Object[]} [resources=[]] the array that will contain all of the resources
 */
function getAllResources(url, callback, resources = []) {
    httpRequest(url, (bundle) => {
        (bundle.entry || []).forEach((item) => {
            if (item.fullUrl && resources.findIndex(
                (resource) => (resource.fullUrl === item.fullUrl)) === -1
            ) {
                resources.push(item);
            }
        });

        let nextURL = getBundleURL(bundle, 'next');
        if (nextURL) {
            const summaryVal = /_summary=..../.exec(url);
            nextURL += summaryVal ? `&${summaryVal[0]}` : '';
            return getAllResources(nextURL, callback, resources);
        }

        callback(resources);
    });
}

/**
 * Finds the given FHIR bundle's link that corresponds to the given rel attribute
 * @param {Object} bundle FHIR JSON Bundle object
 * @param {String} rel the rel attribute to look for: prev|next|self... (see
 * http://www.iana.org/assignments/link-relations/link-relations.xhtml#link-relations-1)
 * @returns {String|null} the url of the link (or null if the link was not found)
 */
function getBundleURL(bundle, linkType) {
    let nextLink = bundle.link;
    if (nextLink) {
        nextLink = nextLink.find((link) => link.relation === linkType);
        return nextLink && nextLink.url ? nextLink.url : null;
    }
    return null;
}

/**
 * Checks a path within an object
 * @param {Object} obj the object to check the path against
 * @param {Array} path the path to check within an object
 * @returns {any} the value at the end of the path or false if the path doesn't exist
 */
function checkPath(obj, path) {
    let objToCheck = JSON.parse(JSON.stringify(obj));
    path.forEach((key) => {
        if (!objToCheck || !objToCheck[key]) {
            objToCheck = false;
            return;
        }
        objToCheck = objToCheck[key];
    });
    return objToCheck;
}

/**
 * Pushes a string to an array within an object (only if it's not already in the array)
 * @param {Object} obj the object that contains the array to push the string to
 * @param {String} keyOfArray the key that corresponds to the array in the object
 * @param {String} str the string to push into the array
 * @returns {Object} the updated object (with the pushed string)
 */
function pushStringToObj(obj, keyOfArray, str) {
    let objToChange = JSON.parse(JSON.stringify(obj));
    objToChange = setInitialObjValue(objToChange, keyOfArray, []);
    if (!objToChange[keyOfArray].includes(str)) {
        objToChange[keyOfArray].push(str);
    }
    return objToChange;
}

/**
 * Increments multiple values in an object by 1
 * @param {Object} obj the object to update
 * @param {String[]} keys the keys corresponding to the values that you want to increment
 * @returns {Object} the updated object (with the incremented values)
 */
function addValuesToObj(obj, keys) {
    let objToChange = JSON.parse(JSON.stringify(obj));
    keys.forEach((key) => {
        objToChange = setInitialObjValue(objToChange, key, 0);
        objToChange[key] += 1;
    });
    return objToChange;
}

/**
 * Sets a value within an object to a given value if the given key doesn't exist in the object
 * @param {Object} obj the object to update
 * @param {any} key the key that points to the value that you wish to change
 * @param {any} value the value to set the key to if the key does not exist in the object
 * @returns {Object} the updated object
 */
function setInitialObjValue(obj, key, value) {
    const objToChange = JSON.parse(JSON.stringify(obj));
    if (!objToChange[key]) {
        objToChange[key] = value;
    }
    return objToChange;
}

/**
 * Sorts key/value pairs based on the value of each pair
 * @param {Object|Array} pairs an object or a 2D array containing key/value pairs
 * @param {Number|Boolean} [arrLength=false] the desired length of the returned arrays 
 * @returns {Array[]} two arrays: the sorted values of the object, and the keys of the object
 * sorted by their corresponding value (both arrays having the length of arrLength)
 */
function sortKeyValuePairs(pairs, arrLength = false) {
    const pairsCopy = pairs.constructor === Array ? pairs.slice() : Object.entries(pairs);
    pairsCopy.sort((pairA, pairB) => pairA[1] - pairB[1]).reverse();
    pairsCopy.length = arrLength || pairsCopy.length;
    return [pairsCopy.map(item => item[0]), pairsCopy.map(item => item[1])];
}

/**
 * Converts a string to title case
 * @param {String} str the string to convert to title case
 * @returns {String} the given string in title case
 */
function toTitleCase(str) {
    return str.replace(/\w\S*/g, txt => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
}

/**
 * Adds new data to a file and saves it
 * @param {String} file the file where one wishes to write and save the data
 * @param {Object} newData the new data to write to the file
 */
function saveDataToFile(file, newData) {
    const jsonContent = Object.assign(JSON.parse(fs.readFileSync(file).toString()), newData);
    fs.writeFileSync(file, JSON.stringify(jsonContent, null, 4)); // Switch back before deployment
}

module.exports = {
    httpRequest,
    getAllResources,
    buildFhirURL,
    checkPath,
    pushStringToObj,
    addValuesToObj,
    setInitialObjValue,
    toTitleCase,
    saveDataToFile,
    sortKeyValuePairs,
};
