const request = require('request');
const config = require('./config');
const fs = require('fs');

/**
 * Executes a GET request to the given URL and calls a callback function with the request's response
 * @param {String} url The URL from which to get data via a GET request
 * @param {Function} callback The callback function that is given the request's response
 */
function httpRequest(url, callback) {
    request({ url, json: true, headers: { accept: 'application/json', }, }, (error, res, json) => {
        if (error) return throwError(error);
        if (res.statusCode >= 400) {
            const err = new Error(res.statusMessage);
            return throwError(err);
        }
        callback(json);
    });
}

/**
 * Creates a URL to query a FHIR server
 * @param {String} path The path of the query within the server, typically a type of FHIR resource
 * @param {String[]} params The parameters of the query
 * @returns {String} Returns the built URL
 */
function buildFhirURL(path, params) {
    const parameters = params.reduce((sum, param) => `${sum + param}&`, '');
    const server = config.SERVER.endsWith('/') ? config.SERVER : `${config.SERVER}/`;
    return `${server + path}?${parameters}_format=json`;
}

/**
 * Gathers an array containing all of the FHIR resources of a specific type from a server
 * @param {String} url The URL that houses the desired resource type
 * @param {Function} callback The callback function that is given the array of resources
 * @param {Object[]} [resources=[]] The array that will eventually contain all of the resources
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
 * Given a fhir bundle fins it's link having the given rel attribute.
 * @param {Object} bundle FHIR JSON Bundle object
 * @param {String} rel The rel attribute to look for: prev|next|self... (see
 * http://www.iana.org/assignments/link-relations/link-relations.xhtml#link-relations-1)
 * @returns {String|null} Returns the url of the link or null if the link was not found.
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
 * Throws an error
 * @param {Error} error The error to throw
 */
function throwError(error) {
    console.log(`Error: ${error}`); // console.log(`Error: ${url} \n${JSON.stringify(json)}`);
    // throw error;
}

/**
 * Checks a path within an object
 * @param {Object} obj The object to check the path against
 * @param {Array} path The path to check within an object
 * @returns {any} The value at the end of the path or false if the path doesn't exist
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
 * Pushes a string to an array within an object (if not already in the array)
 * @param {Object} obj The object that contains the array to push the string to
 * @param {String} key The key that corresponds to the array in the object
 * @param {String} value The string to push into the array
 * @returns {Object} Returns the updated object (with the pushed string)
 */
function pushStringToObj(obj, key, value) {
    let objToChange = JSON.parse(JSON.stringify(obj));
    objToChange = setInitialObjValue(objToChange, key, []);
    if (!objToChange[key].includes(value)) {
        objToChange[key].push(value);
    }
    return objToChange;
}

/**
 * 
 * @param {any} obj 
 * @param {any} keys 
 * @returns 
 */
function addValuesToObj(obj, keys) {
    let objToChange = JSON.parse(JSON.stringify(obj));
    keys.forEach((key) => {
        objToChange = setInitialObjValue(objToChange, key, 0);
        objToChange[key] += 1;
    });
    return objToChange;
}

function setInitialObjValue(obj, key, value) {
    const objToChange = JSON.parse(JSON.stringify(obj));
    if (!objToChange[key]) {
        objToChange[key] = value;
    }
    return objToChange;
}

function sortKeyValuePairs(arr, arrLength) {
    const arrCopy = arr.constructor === Array ? arr.slice() : Object.entries(arr);
    arrCopy.sort((elementOne, elementTwo) => elementOne[1] - elementTwo[1]).reverse();
    arrCopy.length = arrLength || arrCopy.length;
    return [arrCopy.map(item => item[0]), arrCopy.map(item => item[1])];
}

function toTitleCase(str) {
    return str.replace(/\w\S*/g, txt => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
}

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
