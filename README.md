# FHIR Server Dashboard

DEMO: http://docs.smarthealthit.org/fhir-server-dashboard/.

The FHIR Server Dashboard is a standalone app that presents a human-readable representation of the data in a FHIR server. It's particularly useful when looking at the sample data on a FHIR sandbox. Built with Node.js, d3, and Plotly, the dashboard consists of intuitive visualizations that enable clinicians and users to quickly comprehend what a FHIR server contains.

This repository consists of two distinctive parts: a back-end process to analyze a FHIR server, and a static web page that renders the dashboard. These two parts are run independently of one another. The back-end code stores the aggregated data in a local JSON file, which the web page reads whenever it loads.

These two processes are independent of one another because it would be extremely inefficient to analyze an entire FHIR server every time the dashboard is visited. As a result, the two parts are run separately to minimize unnecessary data processing and API calls.

To use this app effectively, run the back-end code intermittently (e.g., once a week or every time the target FHIR server is updated), and the dashboard will display when the server was last aggregated in the top right corner.

## Prerequisites

- Node.js version 8.0.0 or higher (install here: https://nodejs.org/en/download/)
- If you have a lower version of Node.js, you can alternatively download an updated version of Node.js using nvm, which you can find here: https://github.com/creationix/nvm

To check that you have the correct version of Node.js installed, run this command in your terminal:

```sh
node -v
```

## Installation
Run these commands in your terminal:
```sh
cd my/directory/somewhere
git clone https://github.com/smart-on-fhir/fhir-server-dashboard.git
cd fhir-server-dashboard
npm i
```

## Usage
Specify the target server in `server/config.js`:
```js
SERVER: 'my-fhir-server-url.com',
```

To aggregate the data on a FHIR server, run this command in your terminal from the project directory:
```sh
npm run aggregate
```
After these two steps, simply open `client/index.html` in the browser of your choice.

Alternatively, instead of declaring the server in `server/config.js` and running `npm run aggregate`, you can pass in the target FHIR server's URL through the command line:
```sh
node server --server my-fhir-server-url.com
```
A URL passed in through the command line will override the existing `SERVER` variable in `server/config.js`.

#### Example Usage

Define the server as the SMART STU3 Sandbox server in `server/config.js` and then aggregate the data with `npm run aggregate`, or pass it in through the command line:
```js
SERVER: 'https://sb-fhir-stu3.smarthealthit.org/smartstu3/open/',
```
and
```sh
npm run aggregate
```
or just call this command:
```sh
node server --server https://sb-fhir-stu3.smarthealthit.org/smartstu3/open/
```
Check out the resulting `client/index.html` by opening it in a browser of your choice, or look at an example here: http://docs.smarthealthit.org/fhir-server-dashboard/.

## Configuration

To change the target server, change the value of the `SERVER` variable in `server/config.js` or pass it in through the command line:
```js
SERVER: 'my-fhir-server-url.com',
```
or
```sh
node server --server my-fhir-server-url.com
```

To add extra columns to the Resource Counts Table, specify the tags that your server contains in an array in `server/config.js`:
```js
TAGS: ['server-tag-1', 'server-tag-2', 'server-tag-3'],
```

For each tag that you specify in the `TAGS` variable, the Resource Counts Table will contain an extra column with the tag name as the column header. If you would not like to specify any tags, set the variable back to its default value (an empty array):
```js
TAGS: [],
```
***
The default file that contains the aggregated server data is `client/data.json`, but you can save the aggregated data to a different file in the `client` directory. In the command line, you can specify the name of a different output file:
```sh
node server --output-file otherDataFile.json
```
To access this other data file when opening the dashboard, specify the name of the other data file in the `file` parameter of the URL of your dashboard:
```
fhir-server-dashboard.com?file=otherDataFile.json
```
Using this feature, you can use this project to display multiple FHIR servers from the same base URL. To see an example of this, check out these two links:

http://docs.smarthealthit.org/fhir-server-dashboard/

http://docs.smarthealthit.org/fhir-server-dashboard/?file=data-dstu2.json

## Development

If you would like to change the front-end javascript code, edit the `client/visualize.ts` file and compile it to a javascript file using the `npm run build` command in your terminal from the project directory.

## System Requirements
The application should run on any operating system, on the following browser versions:
- Google Chrome 29+
- Firefox 27+
- Safari 7.1+
- Opera 16+
- Internet Explorer 10+
- Microsoft Edge 14+

## License
This project is licensed under the Apache License, Version 2.0 - see the [LICENSE](LICENSE) file for details.

## Information
Made by Asher Dale (@asherdale) in summer 2017 while interning at the Computational Health Informatics Program at Boston Children's Hospital with the SMART team.

Thank you to Dan Gottlieb, Vlad Ignatov, and Alyssa White for all of your help!