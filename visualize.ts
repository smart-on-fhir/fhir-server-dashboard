declare var d3, jQuery, Plotly, document, window, console, MouseEvent;
(function ($, undefined) {
    const chartColor = 'white';
    const headerHeight = 72;
    const verticalMarginHeight = 30;
    const rowHeight = 450;

    function start() {
        $.getJSON('data.json', (data) => {
            callFuncAndCheckParams(makePopPyramid, [data.pyramidData]);
            callFuncAndCheckParams(makeBoxPlot, [data.boxPlotData, 'Number of Resources Per Patient']);
            callFuncAndCheckParams(makeGenderGroupedBar,
                ['Patient Race', data.fRaceLabels, data.fRaceValues,
                    data.mRaceLabels, data.mRaceValues, 'raceBar', true]);
            callFuncAndCheckParams(makeGenderGroupedBar,
                ['Patient Ethnicity', data.fEthLabels, data.fEthValues,
                    data.mEthLabels, data.mEthValues, 'ethBar', true]);
            callFuncAndCheckParams(makeMatrix,
                [data.conditionMatrixLabels, data.conditionMatrixValues]);
            callFuncAndCheckParams(makeMedBarChart,
                [data.medLabels, data.medValues]);
            callFuncAndCheckParams(makeResourceCountsTable,
                [data.resourceLabels, data.resourceCounts, data.tags.concat([''])]);
            callFuncAndCheckParams(makeStateMap, [data.states]);
            callFuncAndCheckParams(serverMetadata, [data.metadata]);

            const mortLabels = ['Alive', 'Deceased'];
            callFuncAndCheckParams(makeGenderGroupedBar, ['Patient Mortality', mortLabels,
                data.fAliveArr, mortLabels, data.mAliveArr, 'aliveBar', false]);

            let prevWidth = $(window).width();
            window.onresize = () => {
                const currentWidth = $(window).width();
                if (currentWidth === prevWidth) return;
                prevWidth = currentWidth;
                resizePlots('.js-plotly-plot', rowHeight);
                resizePlots('.half-height', (rowHeight - verticalMarginHeight) / 2);
                callFuncAndCheckParams(makePopPyramid, [data.pyramidData]);
            };
            resizePlots('.half-height', (rowHeight - verticalMarginHeight) / 2);
            window.setTimeout(() => $('#loader').remove(), 100);
        });

        $('.hamburger').click(() => $('#wrapper').toggleClass('toggled'));
        $('.chart-row div').css('height', `${rowHeight}px`);
        $('.chart-row:not(:first), .raceBar').css('margin-bottom', `${verticalMarginHeight}px`);
        $('#page-content-wrapper').css('padding-top', `${headerHeight}px`);
        $('.page-title').css('cursor', 'pointer').click(() => animateScroll(0));
        linkSidebarButton('.sidelink.overview', '#overview-header');
        linkSidebarButton('.sidelink.patient-data', '#patient-header');
    }

    function linkSidebarButton(sideID, headerID) {
        $(sideID).click(() => animateScroll($(headerID).offset().top - headerHeight));
    }

    function callFuncAndCheckParams(func, args) {
        if (!args.every(arg => typeof arg !== 'undefined'
            && (arg.constructor !== Array || arg.length > 0))) {
            console.log(`Error: could not find all of the necessary data for '${func.name}'.`);
            return;
        }
        func(...args);
    }

    function makePopPyramid(chartData) {
        const margin = { top: 70, right: 30, bottom: 50, left: 30, middle: 20, };
        const pyramidHeight = rowHeight - margin.top - margin.bottom;
        const pyramidWidth = $('.popPyramid').width() - margin.right - margin.left;
        const barRegionWidth = pyramidWidth / 2 - margin.middle;
        const yAxisLeftX = barRegionWidth;
        const yAxisRightX = pyramidWidth - barRegionWidth;

        const translation = (xPoint, yPoint) => `translate(${xPoint},${yPoint})`;

        const popPyramid = d3.select('.popPyramid');
        const svg = popPyramid
            .html('')
            .attr('width', '100%')
            .attr('height', `${rowHeight}px`)
            .append('svg')
            .attr('width', margin.left + pyramidWidth + margin.right)
            .attr('height', margin.top + pyramidHeight + margin.bottom)
            .style('background-color', 'white')
            .append('g')
            .attr('transform', translation(margin.left, margin.top));

        function makePyramidLabel(text, yPoint, selector, divisor) {
            const label = popPyramid.select('svg').append('text')
                .attr('class', selector)
                .attr('y', yPoint)
                .style('font-family', 'sans-serif')
                .style('font-size', '11px')
                .text(text);
            const textWidth = label.node().getComputedTextLength();
            label.attr('x', pyramidWidth / divisor - textWidth / 2 + margin.left);
        }

        const totalMales = d3.sum(chartData, datum => datum.male);
        const totalFemales = d3.sum(chartData, datum => datum.female);
        const percentageOfTotalPop = datum => datum / (totalMales + totalFemales);

        const xAxisLabelYPoint = popPyramid.select('svg').attr('height') - 13;
        makePyramidLabel('Patient Population', 25, 'title', 2);
        makePyramidLabel('Percent of Total Population', xAxisLabelYPoint, 'xLabel popLabel', 2);
        makePyramidLabel('Age', 60, 'ageLabel popLabel', 2);
        makePyramidLabel(`Male Population: ${totalMales}`, 60, 'male popLabel', 4);
        makePyramidLabel(`Female Population: ${totalFemales}`, 60, 'female popLabel', 1.25);

        const maxDataValue = Math.max(
            d3.max(chartData, datum => percentageOfTotalPop(datum.male)),
            d3.max(chartData, datum => percentageOfTotalPop(datum.female))
        );

        const tickFormat = d3.format((maxDataValue >= 0.1) ? '.0%' : '.1%');
        const tickNum = 5;

        const xScale = d3.scaleLinear().domain([0, maxDataValue]).range([0, barRegionWidth]).nice();
        const yScale = d3.scaleBand().domain(chartData.map(datum => datum.group))
            .rangeRound([pyramidHeight, 0], 0.1);

        const yAxisLeft = d3.axisRight().scale(yScale).tickSize(4, 0).tickPadding(margin.middle - 4);
        const yAxisRight = d3.axisLeft().scale(yScale).tickSize(4, 0).tickFormat('');
        const xAxisRight = d3.axisBottom().scale(xScale).tickFormat(tickFormat).ticks(tickNum);
        const xAxisLeft = d3.axisBottom().scale(xScale.copy().range([yAxisLeftX, 0]))
            .tickFormat(tickFormat).ticks(tickNum);

        // scale(-1,1) is used to reverse the left bars
        const rightBars = svg.append('g').attr('transform', translation(yAxisRightX, 0));
        const leftBars = svg.append('g').attr('transform', `${translation(yAxisLeftX, 0)}scale(-1,1)`);

        function appendAxis(type, trans, axisToCall) {
            return svg.append('g').attr('class', `axis ${type}`)
                .attr('transform', trans).call(axisToCall);
        }

        appendAxis('y left', translation(yAxisLeftX, 0), yAxisLeft)
            .selectAll('text').style('text-anchor', 'middle');
        appendAxis('y right', translation(yAxisRightX, 0), yAxisRight);
        appendAxis('x left', translation(0, pyramidHeight), xAxisLeft);
        appendAxis('x right', translation(yAxisRightX, pyramidHeight), xAxisRight);

        function drawBars(group, selector, widthFunc, fill) {
            group.selectAll(`.bar.${selector}`)
                .data(chartData).enter()
                .append('rect')
                .attr('class', `bar ${selector}`)
                .attr('x', 0)
                .attr('y', datum => yScale(datum.group))
                .attr('width', widthFunc)
                .attr('height', yScale.bandwidth())
                .attr('fill', fill)
                .attr('stroke', chartColor)
                .attr('stroke-width', 2)
                .on('click', createBarNumLabels);
        }

        drawBars(leftBars, 'left', datum => xScale(percentageOfTotalPop(datum.male)), 'steelblue');
        drawBars(rightBars, 'right', datum => xScale(percentageOfTotalPop(datum.female)), 'firebrick');
        $('.bar').each((iVar, eVar) => eVar.dispatchEvent(new MouseEvent('click')));

        function createBarNumLabels(datum, id) {
            const bar = d3.select(this);
            const gender = bar.attr('class') === 'bar left' ? 'male' : 'female';
            const label = svg.append('text')
                .attr('class', `hover${gender + id}`)
                .attr('fill', bar.attr('fill'))
                .attr('id', 'hover')
                .attr('y', () => yScale(datum.group) + yScale.bandwidth() - 5);

            if (gender === 'female') {
                label.attr('x', yAxisRightX + xScale(percentageOfTotalPop(datum.female)) + 3)
                    .text([datum.female]);
            } else {
                label.text([datum.male]);
                const textWidth = label.node().getComputedTextLength() + 3;
                label.attr('x', yAxisLeftX - xScale(percentageOfTotalPop(datum.male)) - textWidth);
            }
        }
    }

    function makeStateMap(states) {
        const title = 'Patient Population by State';
        const stateLabels = Object.keys(states);
        const data = [{
            type: 'choropleth',
            locationmode: 'USA-states',
            locations: stateLabels,
            z: stateLabels.map(key => states[key]),
            colorscale: [[0, 'rgb(242,240,247)'], [1, 'rgb(84,39,143)']],
            colorbar: { thickness: 10, },
        }];

        let stateMapLayout = {
            margin: { b: 50, t: 50, },
            geo: {
                scope: 'usa',
                showland: true,
                landcolor: 'rgb(217, 217, 217)',
                subunitcolor: 'rgb(255, 255, 255)',
            },
        };
        stateMapLayout = makePlotLayout(title, stateMapLayout);


        addPlot('.stateMap', title);
        Plotly.plot(title, data, stateMapLayout, { displayModeBar: false, });
    }

    function makeMatrix(conditionMatrixLabels, conditionMatrixValues) {
        const title = 'Condition Co-Morbidity Matrix';
        const yLabels = conditionMatrixLabels.slice().reverse();
        const reversedValues = conditionMatrixValues.slice().reverse();

        const data = [{
            x: conditionMatrixLabels,
            y: yLabels,
            z: reversedValues,
            type: 'heatmap',
            colorscale: [[0, '#b7e4ff'], [1, '#0865a0']],
            showscale: false,
        }];

        const tickfont = {
            size: 11,
            color: 'black',
        };
        let matrixLayout = {
            margin: { l: 110, t: 140, r: 10, b: 10, },
            annotations: [],
            xaxis: {
                ticks: '',
                side: 'top',
                tickangle: 30,
                tickfont,
            },
            yaxis: {
                ticks: '',
                ticksuffix: ' ',
                autosize: false,
                tickfont,
            },
        };
        matrixLayout = makePlotLayout(title, matrixLayout);

        conditionMatrixLabels.forEach((label1, ind1) => {
            conditionMatrixLabels.forEach((label2, ind2) => {
                const result = {
                    x: conditionMatrixLabels[ind2],
                    y: yLabels[ind1],
                    text: reversedValues[ind1][ind2],
                    font: {
                        family: 'sans-serif',
                        size: 12,
                        color: 'white',
                    },
                    showarrow: false,
                };
                matrixLayout.annotations.push(result);
            });
        });
        addPlot('.matrix', title);
        Plotly.newPlot(title, data, matrixLayout, { displayModeBar: false, });
    }

    function makeGenderGroupedBar(title, fLabels, fCounts, mLabels, mCounts, divName, isHalfHeight) {
        const makeTrace = (labels, counts, name, color) => ({
            x: labels,
            y: counts,
            type: 'bar',
            marker: { color, },
            name,
        });
        const fTrace = makeTrace(fLabels, fCounts, 'Female', 'rgb(230,127,127)');
        const mTrace = makeTrace(mLabels, mCounts, 'Male', 'rgb(145,182,212)');
        const data = (mCounts[0] > fCounts[0]) ? [mTrace, fTrace] : [fTrace, mTrace];

        let barLayout = {
            barmode: 'group',
            margin: { t: 50, },
            yaxis: {
                title: 'Number of Patients',
                titlefont: {
                    size: 17,
                },
            },
        };
        barLayout = makePlotLayout(title, barLayout);

        addPlot(`.${divName}`, title, isHalfHeight);
        Plotly.newPlot(title, data, barLayout, { displayModeBar: false, });
    }

    function makeResourceCountsTable(resourceLabels, resourceCounts, tagOrder) {
        const columnTitles = ['Resource'];
        const tagOrderCopy = tagOrder.slice(-1, 1);

        resourceCounts.forEach((resource, index) => {
            const columnTitle = resource[resource.length - 1];
            if (index < resourceCounts.length - 1 && columnTitle !== tagOrderCopy[index]) {
                resourceCounts.push(resourceCounts.splice(index, 1)[0]);
                index -= 1;
                return;
            }
            columnTitles.push(columnTitle);
        });

        const table = d3.select('.resourceTable')
            .append('table')
            .attr('class', 'table table-striped table-hover panel panel-default')
            .style('margin-bottom', 0)
            .style('height', '100%')

        const tableHead = table.append('thead').append('tr');

        columnTitles.forEach((title) => {
            tableHead.append('th').text(title);
        });

        const tbody = table.append('tbody');
        const toggleTBody = table.append('tbody')
            .attr('class', 'toggleTable').style('display', 'none');
        const collapsedHeight = rowHeight / 50 - 1;
        resourceLabels.forEach((label, index) => {
            const tableRow = (index > collapsedHeight ? toggleTBody : tbody).append('tr');
            tableRow.append('td').text(label);
            resourceCounts.forEach((column) => {
                tableRow.append('td').text(column[index]);
            });
        });
        if (resourceCounts[0].length - 1 <= collapsedHeight) return;

        table.append('button').attr('type', 'button').attr('class', 'toggleButton btn btn-info')
            .text('Expand').style('margin', '0 auto');

        const hiddenRowsSize = toggleTBody.selectAll('tr').size();
        const $button = $('.toggleButton');
        const $table = $('.resourceTable');
        const $toggleTable = $('.toggleTable');
        const $parentRow = $($table.parents('.chart-row')[0]);
        $button.click(() => {
            if ($button.text() === 'Expand') {
                $toggleTable.slideDown(0);
                $parentRow.css('margin-bottom', `${37 * hiddenRowsSize}px`);
            } else {
                animateScroll($table.offset().top - headerHeight);
                $toggleTable.slideUp('slow', () => {
                    $parentRow.css('marginBottom', 0);
                });
            }

            $button.text(() => $button.text() === 'Expand' ? 'Collapse' : 'Expand');
        });
    }

    function makeMedBarChart(labels, values) {
        if (labels.length === 0 || values.length === 0) {
            return;
        }
        const title = `Top ${values.length} Prescribed Medications`;
        const data = [{
            x: labels,
            y: values,
            type: 'bar',
        }];
        let barLayout = {
            margin: { t: 140, b: 100, l: 60, r: 60, },
        };
        barLayout = makePlotLayout(title, barLayout);
        addPlot('.meds', title);
        Plotly.newPlot(title, data, barLayout, { displayModeBar: false, });
    }

    function makeBoxPlot(data, title) {
        if (data.length === 0) return;

        const traces = [];
        data.forEach((datum) => {
            traces.push({
                name: datum.resource,
                x: datum.data,
                type: 'box',
                boxpoints: false,
            });
        });

        let boxLayout = {
            margin: { l: 100, r: 30, b: 30, t: 40, },
            showlegend: false,
        };
        boxLayout = makePlotLayout(title, boxLayout);
        addPlot('.boxes', title, true).on('plotly_relayout', truncateLabels);
        Plotly.newPlot(title, traces, boxLayout, { displayModeBar: false, });
    }

    function addPlot(selector, title, isHalfHeight = false) {
        return $(selector).attr('id', title)
            .attr('class', (isHalfHeight ? 'half-height ' : '') + selector.substr(1))
            .css('width', '100%').css('height', `${rowHeight}px`)
    }

    function resizePlots(className, plotHeight) {
        const plotsToResize = Plotly.d3.selectAll(className)
            .style('width', '100%').style('height', `${plotHeight}px`)[0]
            .forEach(node => Plotly.Plots.resize(node));
    }

    function serverMetadata(metadata) {
        const tableBody = d3.select('.metadata')
            .attr('class', 'metadata half-height panel panel-default')
            .style('background-color', 'white')
            .style('margin-bottom', `${verticalMarginHeight}px`)
            .style('height', `${(rowHeight - verticalMarginHeight) / 2}px`)
            .append('table')
            .attr('class', 'table table-hover table-condensed')
            .style('height', '100%')
            .append('tbody');

        addTableRow(tableBody, ['Server URL', `<a href="${metadata.url}">${metadata.url}</a>`]);
        addTableRow(tableBody, ['FHIR Version', metadata.fhirVersion]);
        addTableRow(tableBody, ['Supports JSON', getGlyph(metadata.supports.json)]);
        addTableRow(tableBody, ['Supports XML', getGlyph(metadata.supports.xml)]);
        addTableRow(tableBody, ['Supports SMART-on-FHIR', getGlyph(metadata.supports.smartOnFhir)]);

        $('.last-updated').html(`<h4 class="timestamp">Last Updated: ${metadata.timestamp}</h4>`);
    }

    function addTableRow(tableBody, infoArr) {
        const tableRow = tableBody.append('tr');
        infoArr.forEach((info) => {
            tableRow.append('td').html(info);
        });
    }

    const makePlotLayout = (title, layout) => (<any>Object).assign({ font: { family: 'sans-serif', }, title, }, layout);
    const getGlyph = (bool) => `<span class="glyphicon glyphicon-${bool ? 'ok' : 'remove'}" aria-hidden="true"></span>`;
    const animateScroll = (yPoint) => $('html, body').animate({ scrollTop: yPoint, }, 'slow');

    function truncateString(str, maxLen) {
        const trimStr = str.trim();
        return (trimStr.length > maxLen) ? `${trimStr.substr(0, maxLen - 3).trim()}...` : trimStr;
    }

    function truncateLabels() {
        $('.matrix, .meds, .boxes').find('.xtick > text, .ytick > text')
            .text((index, str) => `${truncateString(str, 15)} `);
    }

    $(start);
})(jQuery);