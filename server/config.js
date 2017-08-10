const DATA_FILE_PATH = '../client/data.json';
const RXNORM_FILE_PATH = 'rxnorm.json';
const ALL_TAGS = 'Total Count';
const TABLE_LAST_ROW_LABEL = 'All Resources';
const CONDITION_MATRIX_LENGTH = 10;
const TOP_MEDS_AMOUNT = 10;
const BOX_PLOT_AMOUNT = 3;

// servers:  "https://sb-fhir-stu3.smarthealthit.org/smartstu3/open/"
// "https://sb-fhir-dstu2.smarthealthit.org/api/smartdstu2/open/", "http://test.fhir.org/r3/"
// "http://spark.furore.com/fhir/", "http://vonk.furore.com/"

// User settings
const SERVER = 'https://sb-fhir-stu3.smarthealthit.org/smartstu3/open/';
const TAGS = [];// ['smart-7-2017', 'synthea-7-2017'];

module.exports = {
    DATA_FILE_PATH,
    RXNORM_FILE_PATH,
    TABLE_LAST_ROW_LABEL,
    ALL_TAGS,
    CONDITION_MATRIX_LENGTH,
    TOP_MEDS_AMOUNT,
    BOX_PLOT_AMOUNT,
    SERVER,
    TAGS,
};
