var tree_node = require('tnt.tree.node');
var api = require('tnt.api');

var bubblesView = function () {
    'use strict';

    var dispatch = d3.dispatch('click', 'mouseover', 'mouseout');

    var conf = {
        diameter: 600,
        duration: 1000,
        data: undefined, // data is a promise
        colors: ['#FFFFFF', '#2c619f'],
    };

    var context;

    var render = function (container) {
        var colorScale = d3.scaleLinear()
            .domain([0, 1])
            .range(conf.colors);

        console.log('bubbles called');
        var canvas = d3.select(container)
            .append('canvas')
            .attr('width', conf.diameter)
            .attr('height', conf.diameter);

        conf.data.then(function (tree) {
            var flatTree = flattenTree(tree);
            var pack = d3.pack()
                .padding(1.5)
                .size([conf.diameter, conf.diameter]);
            var root = d3.hierarchy(flatTree)
                .sort(function(d) {
                    return d.value;
                })
                .sum(function (d) {
                    return d.__association_score;
                });

            pack(root);
            context = canvas.node().getContext('2d');

            // Draw the diseases circles
            var taNodes = tree_node(root).children();
            taNodes.forEach(function (node) {
                console.log(node.data());
                // First draw TA diseases...
                var taData = node.data();
                var tx = taData.x;
                var ty = taData.y;
                var tr = taData.r;
                context.beginPath();
                context.arc(tx, ty, tr, 0, 2 * Math.PI);
                context.fillStyle = conf.color;
                context.globalAlpha = 0.1;
                context.fill();
                context.globalAlpha = 1;
                context.lineWidth = 1;
                context.strokeStyle = conf.color;
                context.stroke();

                // Then all diseases in the TA
                node.get_all_leaves().forEach(function (leaf) {
                    context.save();
                    var diseaseData = leaf.data();
                    var lx = diseaseData.x;
                    var ly = diseaseData.y;
                    var lr = diseaseData.r;
                    context.beginPath();
                    context.arc(lx, ly, lr, 0, 2 * Math.PI);
                    context.fillStyle = colorScale(diseaseData.value);
                    context.fill();
                    context.lineWidth = 1;
                    context.strokeStyle = conf.color;
                    context.stroke();

                    // Draw the labels on the diseases
                    context.textAlign = 'center';
                    context.textBaseline = 'middle';
                    var diseaseLabel = diseaseData.data.label;
                    var labelAndFontsize = calcFontSize(context, diseaseLabel, lr);
                    context.font = labelAndFontsize.fontsize + "px Arial";
                    context.fillStyle = 'black';
                    context.fillText(labelAndFontsize.label, lx, ly);
                    context.restore();
                });

                // TA labels (curved text)
                var taLabel = taData.data.label;
                var angleAndStr = calcAngle(context, taLabel, tr);
                if (angleAndStr.label.length > 3) {
                    drawTextAlongArc(context, angleAndStr.label, tx, ty, tr, angleAndStr.angle);
                }
            })
        });

    };

    api(render)
        .getset(conf);

    render.on = function () {
        var value = dispatch.on.apply(dispatch, arguments);
        return value === dispatch ? t : value;
    };

    return render;
};

function calcFontSize(context, str, r) {
    console.warn('initial label... ' + str);
    var minFontsize = 10;
    var maxFontSize = 18;
    var fontSize = 12;
    context.save();
    for (;;) {
        context.font = fontSize + 'px Arial';
        var textLength = context.measureText(str).width;
        console.log('textLength: ' + textLength + ' vs ' + (r*1.6) + ' of node radius');
        if (textLength > (r * 1.6)) {
            fontSize -= 1;
            console.log('decreasing fontsize to ' + fontSize);
        } else if (textLength < (r * 1.6)) {
            fontSize += 1;
        }
        if (fontSize > maxFontSize) {
            console.log('returning... ' + fontSize + ' and ' + str);
            return {
                label: str,
                fontsize: maxFontSize
            };
        } else if (fontSize < minFontsize) {
            fontSize = minFontSize;
            str = str.substring(0, str.length - 1);
            console.log('fontsize is too small, reducing the label to ' + str);
        }

        // condition to give away
        return {
            label: str,
            fontsize: fontSize
        };
    }
}

function calcAngle(context, str, radius) {
    context.save();
    for(;;) {
        context.font = "bold 14px Arial";
        var angle = context.measureText(str).width / radius;
        if (angle > Math.PI) {
            str = str.substring(0, str.length - 1);
        } else {
            context.restore();
            return {
                label: str,
                angle: angle
            };
        }
    }
}

function drawTextAlongArc(context, str, centerX, centerY, radius, angle) {
    var len = str.length;
    var s;
    context.save();
    context.translate(centerX, centerY);
    context.rotate(-1 * angle / 2);
    context.rotate(-1 * (angle / len) / 2);
    for (var n = 0; n < len; n++) {
        context.rotate(angle / len);
        context.save();
        context.translate(0, -1 * radius);
        s = str[n];
        context.textAlign = 'center';
        context.textBaseline = 'hanging';

        var normalFont = 'bold 12px Arial';
        var shadowFont = 'bold 14px Arial';

        // shadow
        context.fillStyle = '#dddddd';
        context.font = shadowFont;
        context.fillText(s, 0, 0);

        // label
        context.font = normalFont;
        context.fillStyle = 'black';
        context.fillText(s, 0, 0);

        context.restore();
    }
    context.restore();
}


function flattenTree(data) {
    if (!data) {
        return [];
    }

    if (!data.children) {
        return data;
    }


    var therapeuticAreas = data.children;
    for (var i = 0; i < therapeuticAreas.length; i++) {
        var tA = therapeuticAreas[i];

        var taChildren = tA.children;
        if (!taChildren) {
            // If the TA doesn't have children just create one for it with the same information as the TA
            tA.children = [_.clone(tA)];
        }
        tA.__disease_id = tA.disease.id;
        tA.__disease_name = tA.disease.efo_info.label;

        // adjust name and toggle the tree structure and save it under the "childrenTree" property
        var ta_node = tree_node(tA);
        ta_node.apply(function (node) {
            var d = node.data();
            d.__disease_id = d.disease.id;
            d.__disease_name = d.disease.efo_info.label;
            var key = "";
            node.upstream(function (node) {
                key = key + "_" + node.property(function (d) {
                    return d.disease.id;
                });
            });
            d.__key = key;
        }, true);
        tA.childrenTree = _.cloneDeep(tA.children); // can be done with ta_node.subtree?

        // Create the flatten structure of the children
        var flattenChildren = ta_node.flatten(true).data().children;
        var newChildren = [];
        var nonRedundant = {};
        for (var j = 0; j < flattenChildren.length; j++) {
            var childData = flattenChildren[j];
            if (nonRedundant[childData.name] === undefined) {
                nonRedundant[childData.name] = 1;
                newChildren.push(childData);
            }
        }
        tA.children = newChildren;
    }
    return data;
}

module.exports = bubblesView;
