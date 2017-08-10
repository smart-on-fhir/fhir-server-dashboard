(function ($, undefined) {
    var chartColor = 'white';
    var headerHeight = 72;
    var verticalMarginHeight = 30;
    var rowHeight = 450;
    function start() {
        $.getJSON('data.json', function (data) {
            callFuncAndCheckParams(makePopPyramid, [data.pyramidData]);
            callFuncAndCheckParams(makeBoxPlot, [data.boxPlotData, 'Number of Resources Per Patient']);
            callFuncAndCheckParams(makeGenderGroupedBar, ['Patient Race', data.fRaceLabels, data.fRaceValues,
                data.mRaceLabels, data.mRaceValues, 'raceBar', true]);
            callFuncAndCheckParams(makeGenderGroupedBar, ['Patient Ethnicity', data.fEthLabels, data.fEthValues,
                data.mEthLabels, data.mEthValues, 'ethBar', true]);
            callFuncAndCheckParams(makeMatrix, [data.conditionMatrixLabels, data.conditionMatrixValues]);
            callFuncAndCheckParams(makeMedBarChart, [data.medLabels, data.medValues]);
            callFuncAndCheckParams(makeResourceCountsTable, [data.resourceLabels, data.resourceCounts, data.tags.concat([''])]);
            callFuncAndCheckParams(makeStateMap, [data.states]);
            callFuncAndCheckParams(serverMetadata, [data.metadata]);
            var mortLabels = ['Alive', 'Deceased'];
            callFuncAndCheckParams(makeGenderGroupedBar, ['Patient Mortality', mortLabels,
                data.fAliveArr, mortLabels, data.mAliveArr, 'aliveBar', false]);
            var prevWidth = $(window).width();
            window.onresize = function () {
                var currentWidth = $(window).width();
                if (currentWidth === prevWidth)
                    return;
                prevWidth = currentWidth;
                resizePlots('.js-plotly-plot', rowHeight);
                resizePlots('.half-height', (rowHeight - verticalMarginHeight) / 2);
                callFuncAndCheckParams(makePopPyramid, [data.pyramidData]);
            };
            resizePlots('.half-height', (rowHeight - verticalMarginHeight) / 2);
            window.setTimeout(function () {
                $('#load').remove();
                $('.last-updated').html("<h4 class=\"timestamp\">Last Updated: " + data.metadata.timestamp + "</h4>");
            }, 100);
        });
        $('.hamburger').click(function () { return $('#wrapper').toggleClass('toggled'); });
        $('.chart-row div').css('height', rowHeight + "px");
        $('.chart-row:not(:first), .raceBar').css('margin-bottom', verticalMarginHeight + "px");
        $('#page-content-wrapper').css('padding-top', headerHeight + "px");
        $('.page-title').css('cursor', 'pointer').click(function () { return animateScroll(0); });
        linkSidebarButton('.sidelink.overview', '#overview-header');
        linkSidebarButton('.sidelink.patient-data', '#patient-header');
    }
    function linkSidebarButton(sideID, headerID) {
        $(sideID).click(function () { return animateScroll($(headerID).offset().top - headerHeight); });
    }
    function callFuncAndCheckParams(func, args) {
        if (!args.every(function (arg) { return typeof arg !== 'undefined'
            && (arg.constructor !== Array || arg.length > 0); })) {
            console.log("Error: could not find all of the necessary data for '" + func.name + "'.");
            return;
        }
        func.apply(void 0, args);
    }
    function makePopPyramid(chartData) {
        var margin = { top: 70, right: 30, bottom: 50, left: 30, middle: 20 };
        var pyramidHeight = rowHeight - margin.top - margin.bottom;
        var pyramidWidth = $('.popPyramid').width() - margin.right - margin.left;
        var barRegionWidth = pyramidWidth / 2 - margin.middle;
        var yAxisLeftX = barRegionWidth;
        var yAxisRightX = pyramidWidth - barRegionWidth;
        var translation = function (xPoint, yPoint) { return "translate(" + xPoint + "," + yPoint + ")"; };
        var popPyramid = d3.select('.popPyramid');
        var svg = popPyramid
            .html('')
            .attr('width', '100%')
            .attr('height', rowHeight + "px")
            .append('svg')
            .attr('width', margin.left + pyramidWidth + margin.right)
            .attr('height', margin.top + pyramidHeight + margin.bottom)
            .style('background-color', 'white')
            .append('g')
            .attr('transform', translation(margin.left, margin.top));
        function makePyramidLabel(text, yPoint, selector, divisor) {
            var label = popPyramid.select('svg').append('text')
                .attr('class', selector)
                .attr('y', yPoint)
                .style('font-family', 'sans-serif')
                .style('font-size', '11px')
                .text(text);
            var textWidth = label.node().getComputedTextLength();
            label.attr('x', pyramidWidth / divisor - textWidth / 2 + margin.left);
        }
        var totalMales = d3.sum(chartData, function (datum) { return datum.male; });
        var totalFemales = d3.sum(chartData, function (datum) { return datum.female; });
        var percentageOfTotalPop = function (datum) { return datum / (totalMales + totalFemales); };
        var xAxisLabelYPoint = popPyramid.select('svg').attr('height') - 13;
        makePyramidLabel('Patient Population', 25, 'title', 2);
        makePyramidLabel('Percent of Total Population', xAxisLabelYPoint, 'xLabel popLabel', 2);
        makePyramidLabel('Age', 60, 'ageLabel popLabel', 2);
        makePyramidLabel("Male Population: " + totalMales, 60, 'male popLabel', 4);
        makePyramidLabel("Female Population: " + totalFemales, 60, 'female popLabel', 1.25);
        var maxDataValue = Math.max(d3.max(chartData, function (datum) { return percentageOfTotalPop(datum.male); }), d3.max(chartData, function (datum) { return percentageOfTotalPop(datum.female); }));
        var tickFormat = d3.format((maxDataValue >= 0.1) ? '.0%' : '.1%');
        var tickNum = 5;
        var xScale = d3.scaleLinear().domain([0, maxDataValue]).range([0, barRegionWidth]).nice();
        var yScale = d3.scaleBand().domain(chartData.map(function (datum) { return datum.group; }))
            .rangeRound([pyramidHeight, 0], 0.1);
        var yAxisLeft = d3.axisRight().scale(yScale).tickSize(4, 0).tickPadding(margin.middle - 4);
        var yAxisRight = d3.axisLeft().scale(yScale).tickSize(4, 0).tickFormat('');
        var xAxisRight = d3.axisBottom().scale(xScale).tickFormat(tickFormat).ticks(tickNum);
        var xAxisLeft = d3.axisBottom().scale(xScale.copy().range([yAxisLeftX, 0]))
            .tickFormat(tickFormat).ticks(tickNum);
        // scale(-1,1) is used to reverse the left bars
        var rightBars = svg.append('g').attr('transform', translation(yAxisRightX, 0));
        var leftBars = svg.append('g').attr('transform', translation(yAxisLeftX, 0) + "scale(-1,1)");
        function appendAxis(type, trans, axisToCall) {
            return svg.append('g').attr('class', "axis " + type)
                .attr('transform', trans).call(axisToCall);
        }
        appendAxis('y left', translation(yAxisLeftX, 0), yAxisLeft)
            .selectAll('text').style('text-anchor', 'middle');
        appendAxis('y right', translation(yAxisRightX, 0), yAxisRight);
        appendAxis('x left', translation(0, pyramidHeight), xAxisLeft);
        appendAxis('x right', translation(yAxisRightX, pyramidHeight), xAxisRight);
        function drawBars(group, selector, widthFunc, fill) {
            group.selectAll(".bar." + selector)
                .data(chartData).enter()
                .append('rect')
                .attr('class', "bar " + selector)
                .attr('x', 0)
                .attr('y', function (datum) { return yScale(datum.group); })
                .attr('width', widthFunc)
                .attr('height', yScale.bandwidth())
                .attr('fill', fill)
                .attr('stroke', chartColor)
                .attr('stroke-width', 2)
                .on('click', createBarNumLabels);
        }
        drawBars(leftBars, 'left', function (datum) { return xScale(percentageOfTotalPop(datum.male)); }, 'steelblue');
        drawBars(rightBars, 'right', function (datum) { return xScale(percentageOfTotalPop(datum.female)); }, 'firebrick');
        $('.bar').each(function (iVar, eVar) { return eVar.dispatchEvent(new MouseEvent('click')); });
        function createBarNumLabels(datum, id) {
            var bar = d3.select(this);
            var gender = bar.attr('class') === 'bar left' ? 'male' : 'female';
            var label = svg.append('text')
                .attr('class', "hover" + (gender + id))
                .attr('fill', bar.attr('fill'))
                .attr('id', 'hover')
                .attr('y', function () { return yScale(datum.group) + yScale.bandwidth() - 5; });
            if (gender === 'female') {
                label.attr('x', yAxisRightX + xScale(percentageOfTotalPop(datum.female)) + 3)
                    .text([datum.female]);
            }
            else {
                label.text([datum.male]);
                var textWidth = label.node().getComputedTextLength() + 3;
                label.attr('x', yAxisLeftX - xScale(percentageOfTotalPop(datum.male)) - textWidth);
            }
        }
    }
    function makeStateMap(states) {
        var title = 'Patient Population by State';
        var stateLabels = Object.keys(states);
        var data = [{
                type: 'choropleth',
                locationmode: 'USA-states',
                locations: stateLabels,
                z: stateLabels.map(function (key) { return states[key]; }),
                colorscale: [[0, 'rgb(242,240,247)'], [1, 'rgb(84,39,143)']],
                colorbar: { thickness: 10 }
            }];
        var stateMapLayout = {
            margin: { b: 50, t: 50 },
            geo: {
                scope: 'usa',
                showland: true,
                landcolor: 'rgb(217, 217, 217)',
                subunitcolor: 'rgb(255, 255, 255)'
            }
        };
        stateMapLayout = makePlotLayout(title, stateMapLayout);
        addPlot('.stateMap', title);
        Plotly.plot(title, data, stateMapLayout, { displayModeBar: false });
    }
    function makeMatrix(conditionMatrixLabels, conditionMatrixValues) {
        var title = 'Condition Co-Morbidity Matrix';
        var yLabels = conditionMatrixLabels.slice().reverse();
        var reversedValues = conditionMatrixValues.slice().reverse();
        var data = [{
                x: conditionMatrixLabels,
                y: yLabels,
                z: reversedValues,
                type: 'heatmap',
                colorscale: [[0, '#b7e4ff'], [1, '#0865a0']],
                showscale: false
            }];
        var tickfont = {
            size: 11,
            color: 'black'
        };
        var matrixLayout = {
            margin: { l: 110, t: 140, r: 10, b: 10 },
            annotations: [],
            xaxis: {
                ticks: '',
                side: 'top',
                tickangle: 30,
                tickfont: tickfont
            },
            yaxis: {
                ticks: '',
                ticksuffix: ' ',
                autosize: false,
                tickfont: tickfont
            }
        };
        matrixLayout = makePlotLayout(title, matrixLayout);
        conditionMatrixLabels.forEach(function (label1, ind1) {
            conditionMatrixLabels.forEach(function (label2, ind2) {
                var result = {
                    x: conditionMatrixLabels[ind2],
                    y: yLabels[ind1],
                    text: reversedValues[ind1][ind2],
                    font: {
                        family: 'sans-serif',
                        size: 12,
                        color: 'white'
                    },
                    showarrow: false
                };
                matrixLayout.annotations.push(result);
            });
        });
        addPlot('.matrix', title);
        Plotly.newPlot(title, data, matrixLayout, { displayModeBar: false });
    }
    function makeGenderGroupedBar(title, fLabels, fCounts, mLabels, mCounts, divName, isHalfHeight) {
        var makeTrace = function (labels, counts, name, color) { return ({
            x: labels,
            y: counts,
            type: 'bar',
            marker: { color: color },
            name: name
        }); };
        var fTrace = makeTrace(fLabels, fCounts, 'Female', 'rgb(230,127,127)');
        var mTrace = makeTrace(mLabels, mCounts, 'Male', 'rgb(145,182,212)');
        var data = (mCounts[0] > fCounts[0]) ? [mTrace, fTrace] : [fTrace, mTrace];
        var barLayout = {
            barmode: 'group',
            margin: { t: 50 },
            yaxis: {
                title: 'Number of Patients',
                titlefont: {
                    size: 17
                }
            }
        };
        barLayout = makePlotLayout(title, barLayout);
        addPlot("." + divName, title, isHalfHeight);
        Plotly.newPlot(title, data, barLayout, { displayModeBar: false });
    }
    function makeResourceCountsTable(resourceLabels, resourceCounts, tagOrder) {
        var columnTitles = ['Resource'];
        console.log(tagOrder);
        var tagOrderCopy = tagOrder.slice(-1, 1);
        console.log(tagOrderCopy);
        // resourceCounts.forEach((resource, index) => {
        //     const columnTitle = resource[resource.length - 1];
        //     if (index < resourceCounts.length - 1 && columnTitle !== tagOrderCopy[index]) {
        //         resourceCounts.push(resourceCounts.splice(index, 1)[0]);
        //         index -= 1;
        //         return;
        //     }
        //     columnTitles.push(columnTitle);
        // });
        // console.log(columnTitles);
        console.log(tagOrderCopy);
        for (var i = 0; i < resourceCounts.length; i++) {
            var columnTitle = resourceCounts[i][resourceCounts[i].length - 1];
            if (i < resourceCounts.length - 1 && columnTitle !== tagOrder[i]) {
                resourceCounts.push(resourceCounts.splice(i, 1)[0]);
                console.log(resourceCounts);
                i -= 1;
                continue;
            }
            columnTitles.push(columnTitle);
        }
        console.log(columnTitles);
        var table = d3.select('.resourceTable')
            .append('table')
            .attr('class', 'table table-striped table-hover panel panel-default')
            .style('margin-bottom', 0)
            .style('height', '100%');
        var tableHead = table.append('thead').append('tr');
        columnTitles.forEach(function (title) {
            tableHead.append('th').text(title);
        });
        var tbody = table.append('tbody');
        var toggleTBody = table.append('tbody')
            .attr('class', 'toggleTable').style('display', 'none');
        var collapsedHeight = rowHeight / 50 - 1;
        resourceLabels.forEach(function (label, index) {
            var tableRow = (index > collapsedHeight ? toggleTBody : tbody).append('tr');
            tableRow.append('td').text(label);
            resourceCounts.forEach(function (column) {
                tableRow.append('td').text(column[index]);
            });
        });
        if (resourceCounts[0].length - 1 <= collapsedHeight)
            return;
        table.append('button').attr('type', 'button').attr('class', 'toggleButton btn btn-info')
            .text('Expand').style('margin', '0 auto');
        var hiddenRowsSize = toggleTBody.selectAll('tr').size();
        var $button = $('.toggleButton');
        var $table = $('.resourceTable');
        var $toggleTable = $('.toggleTable');
        var $parentRow = $($table.parents('.chart-row')[0]);
        $button.click(function () {
            if ($button.text() === 'Expand') {
                $toggleTable.slideDown(0);
                $parentRow.css('margin-bottom', 37 * hiddenRowsSize + "px");
            }
            else {
                animateScroll($table.offset().top - headerHeight);
                $toggleTable.slideUp('slow', function () {
                    $parentRow.css('marginBottom', 0);
                });
            }
            $button.text(function () { return $button.text() === 'Expand' ? 'Collapse' : 'Expand'; });
        });
    }
    function makeMedBarChart(labels, values) {
        if (labels.length === 0 || values.length === 0) {
            return;
        }
        var title = "Top " + values.length + " Prescribed Medications";
        var data = [{
                x: labels,
                y: values,
                type: 'bar'
            }];
        var barLayout = {
            margin: { t: 140, b: 100, l: 60, r: 60 }
        };
        barLayout = makePlotLayout(title, barLayout);
        addPlot('.meds', title);
        Plotly.newPlot(title, data, barLayout, { displayModeBar: false });
    }
    function makeBoxPlot(data, title) {
        if (data.length === 0)
            return;
        var traces = [];
        data.forEach(function (datum) {
            traces.push({
                name: datum.resource,
                x: datum.data,
                type: 'box',
                boxpoints: false
            });
        });
        var boxLayout = {
            margin: { l: 100, r: 30, b: 30, t: 40 },
            showlegend: false
        };
        boxLayout = makePlotLayout(title, boxLayout);
        addPlot('.boxes', title, true).on('plotly_relayout', truncateLabels);
        Plotly.newPlot(title, traces, boxLayout, { displayModeBar: false });
    }
    function addPlot(selector, title, isHalfHeight) {
        if (isHalfHeight === void 0) { isHalfHeight = false; }
        return $(selector).attr('id', title)
            .attr('class', (isHalfHeight ? 'half-height ' : '') + selector.substr(1))
            .css('width', '100%').css('height', rowHeight + "px");
    }
    function resizePlots(className, plotHeight) {
        var plotsToResize = Plotly.d3.selectAll(className)
            .style('width', '100%').style('height', plotHeight + "px")[0]
            .forEach(function (node) { return Plotly.Plots.resize(node); });
    }
    function serverMetadata(metadata) {
        var tableBody = d3.select('.metadata')
            .attr('class', 'metadata half-height panel panel-default')
            .style('background-color', 'white')
            .style('margin-bottom', verticalMarginHeight + "px")
            .style('height', (rowHeight - verticalMarginHeight) / 2 + "px")
            .append('table')
            .attr('class', 'table table-hover table-condensed')
            .style('height', '100%')
            .append('tbody');
        addTableRow(tableBody, ['Server URL', "<a href=\"" + metadata.url + "\">" + metadata.url + "</a>"]);
        addTableRow(tableBody, ['FHIR Version', metadata.fhirVersion]);
        addTableRow(tableBody, ['Supports JSON', getGlyph(metadata.supports.json)]);
        addTableRow(tableBody, ['Supports XML', getGlyph(metadata.supports.xml)]);
        addTableRow(tableBody, ['Supports SMART-on-FHIR', getGlyph(metadata.supports.smartOnFhir)]);
    }
    function addTableRow(tableBody, infoArr) {
        var tableRow = tableBody.append('tr');
        infoArr.forEach(function (info) {
            tableRow.append('td').html(info);
        });
    }
    var makePlotLayout = function (title, layout) { return Object.assign({ font: { family: 'sans-serif' }, title: title }, layout); };
    var getGlyph = function (bool) { return "<span class=\"glyphicon glyphicon-" + (bool ? 'ok' : 'remove') + "\" aria-hidden=\"true\"></span>"; };
    var animateScroll = function (yPoint) { return $('html, body').animate({ scrollTop: yPoint }, 'slow'); };
    function truncateString(str, maxLen) {
        var trimStr = str.trim();
        return (trimStr.length > maxLen) ? trimStr.substr(0, maxLen - 3).trim() + "..." : trimStr;
    }
    function truncateLabels() {
        $('.matrix, .meds, .boxes').find('.xtick > text, .ytick > text')
            .text(function (index, str) { return truncateString(str, 15) + " "; });
    }
    $(start);
})(jQuery);
