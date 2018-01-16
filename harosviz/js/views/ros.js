/*
Copyright (c) 2016 Andre Santos

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/

(function () {
    "use strict";

    var views = window.App.Views;

    views.RosBoard = views.BaseView.extend({
        id: "ros-board",

        navigateOptions: { trigger: false, replace: true },

        events: {
            "change #ros-config-select": "onSelect"
        },

        initialize: function (options) {
            this.projectId = null;
            this.router = options.router;

            this.$configSelect = this.$("#ros-config-select");
            this.$summary = this.$("#config-details");

            this.graph = new views.RosStaticGraph({
                el: this.$el.find("#config-graph"),
                collection: new Backbone.Collection()
            });

            this.configTemplate = _.template($("#ros-board-config-summary").html(), {variable: "data"});

            this.listenTo(this.collection, "sync", this.onSync);
        },

        render: function () {
            this.graph.visible = this.visible;
            if (!this.visible) return this;
            if (this.collection.length > 0) {
                var config = this.collection.get(this.$configSelect.val());
                this.$summary.html(this.configTemplate(_.clone(config.attributes)));
                this.graph.render();
            } else {
                this.$summary.html("There are no configurations to display.");
            }
            return this;
        },

        build: function (project, configId) {
            this.projectId = project.id;
            this.$summary.html("Select a configuration to display.");
            if (this.collection.length > 0) {
                if (configId == null || this.collection.get(configId) == null)
                    configId = this.collection.first().id;
                this.$configSelect.val(configId);
                this.onSelect();
            }
            return this;
        },

        onSync: function (collection, response, options) {
            this.$configSelect.html(this.collection.map(this.optionTemplate).join("\n"));
            if (this.collection.length > 0) {
                this.$configSelect.val(this.collection.first().id);
            }
            if (this.visible) this.onSelect();
        },

        onSelect: function () {
            var config = this.collection.get(this.$configSelect.val());
            this.router.navigate("models/" + config.id, this.navigateOptions);
            this.graph.collection.reset(config.get("nodes"));
            this.render();
        },

        onResize: function () {
            this.graph.onResize();
        },

        optionTemplate: _.template("<option><%= data.id %></option>", {variable: "data"})
    });


    ////////////////////////////////////////////////////////////////////////////

    views.RosStaticGraph = Backbone.View.extend({
        id: "config-graph",

        spacing: 16,

        events: {
            "click #config-btn-focus":      "onFocus",
            "click #config-btn-info":       "onInfo"
        },

        initialize: function (options) {
            _.bindAll(this, "onEmptyClick", "onZoom");
            this.visible = false;

            this.graph = new dagre.graphlib.Graph();
            this.graph.setGraph({
                nodesep: this.spacing, ranksep: this.spacing, acyclicer: "greedy"
            });
            this.focus = null;
            this.selection = null;
            this.zoom = d3.zoom().scaleExtent([0.125, 4]).on("zoom", this.onZoom);
            this.d3svg = d3.select(this.$el[0]).append("svg").call(this.zoom);
            this.d3g = this.d3svg.append("g").attr("class", "graph");
            this.d3svg.on("click", this.onEmptyClick);

            this.$nodeActionBar = this.$("#config-node-action-bar");
            this.$nodeActionBar.hide();

            this.infoView = new views.NodeInfo({ el: this.$("#config-info-modal") });
            this.infoView.hide();

            this.nodeTemplate = _.template($("#ros-board-info-modal").html(), {variable: "data"});

            this.listenTo(this.collection, "reset", this.onReset);
        },

        render: function () {
            var i, v, nodes, edges, g = this.graph, graph;
            if (!this.visible) return this;
            if (this.collection.length > 0) {
                graph = this.updateVisibility();
                dagre.layout(graph);
                for (nodes = g.nodes(), i = nodes.length; i--;)
                    g.node(nodes[i]).render();
                for (edges = g.edges(), i = edges.length; i--;)
                    g.edge(edges[i]).render();
                this.onResize();
            }
            return this;
        },

        renderEdge: function () {
            var path;
            this.d3path.classed("hidden", !this.visible);
            if (this.visible) {
                path = d3.path();
                path.moveTo(this.source.x, this.source.y);
                path.lineTo(this.target.x, this.target.y);
                this.d3path.attr("d", path);
            }
            return this;
        },

        updateVisibility: function () {
            var i, v, visibleGraph,
                nodes = this.graph.nodes(),
                edges = this.graph.edges();
            if (this.focus != null) {
                visibleGraph = new dagre.graphlib.Graph();
                visibleGraph.setGraph(this.graph.graph());
                for (i = nodes.length; i--;) {
                    v = this.graph.node(nodes[i]);
                    v.visible = v === this.focus || this.graph.hasEdge(v.label, this.focus.label) ||
                            this.graph.hasEdge(this.focus.label, v.label);
                    if (v.visible) visibleGraph.setNode(v.label, v);
                }
                for (i = edges.length; i--;) {
                    v = this.graph.edge(edges[i]);
                    v.visible = edges[i].v === this.focus.label || edges[i].w === this.focus.label;
                    if (v.visible) visibleGraph.setEdge(edges[i], v);
                }
            } else {
                visibleGraph = this.graph;
                for (i = nodes.length; i--;) {
                    this.graph.node(nodes[i]).visible = true;
                }
                    
                for (i = edges.length; i--;)
                    this.graph.edge(edges[i]).visible = true;
            }
            return visibleGraph;
        },

        onReset: function (collection, options) {
            var i, nodes = this.graph.nodes();
            for (i = nodes.length; i--;)
                this.stopListening(this.graph.node(nodes[i]));
            this.graph = new dagre.graphlib.Graph();
            this.graph.setGraph({
                nodesep: this.spacing, ranksep: this.spacing, acyclicer: "greedy"
            });
            this.d3g.remove();
            this.d3g = this.d3svg.append("g").attr("class", "graph");
            collection.each(this.onAdd, this);
            this.focus = null;
            this.selection = null;
            // this.render();
        },

        onAdd: function (model) {
            var view, names = {};
            model.set({ id: model.cid, resourceType: "node" });
            view = new views.ResourceNode({
                model: model, el: this.d3g.append("g").node()
            });
            this.listenTo(view, "selected", this.onSelection);
            this.graph.setNode(model.id, view);
            this._addLinkNodes(model.id, model.get("publishers"), "topic", names, "source");
            this._addLinkNodes(model.id, model.get("subscribers"), "topic", names, "target");
            this._addLinkNodes(model.id, model.get("servers"), "service", names, "target");
            this._addLinkNodes(model.id, model.get("clients"), "service", names, "source");
        },

        _addLinkNodes: function (node, list, type, names, direction) {
            var i = list.length, name, model, view;
            while (i--) {
                name = type + ":" + list[i];
                if (!names.hasOwnProperty(name)) {
                    model = new Backbone.Model({
                        name: list[i], resourceType: type, conditions: []
                    });
                    model.set("id", model.cid);
                    names[name] = model;
                    view = new views.ResourceNode({
                        model: model, el: this.d3g.append("g").node()
                    });
                    this.listenTo(view, "selected", this.onSelection);
                    this.graph.setNode(model.id, view);
                }
                this._addEdge(node, model.id, direction);
            }
        },

        _addEdge: function (node, link, direction) {
            var el = this.d3g.insert("path", ":first-child")
                             .classed("edge hidden", true),
                edge = {
                    d3path: el,
                    visible: false,
                    render: this.renderEdge
                };
            if (direction === "source") {
                edge.source = this.graph.node(node);
                edge.target = this.graph.node(link);
                this.graph.setEdge(node, link, edge);
            } else {
                edge.target = this.graph.node(node);
                edge.source = this.graph.node(link);
                this.graph.setEdge(link, node, edge);
            }
        },

        onZoom: function () {
            this.d3g.attr("transform", d3.event.transform);
            this.d3g.classed("zoomed-out", d3.event.transform.k < 0.3);
        },

        onEmptyClick: function () {
            d3.event.stopImmediatePropagation();
            this.deselect();
        },

        onSelection: function (id) {
            if (this.selection != null) {
                this.selection.setClass("selected", false);
                this.highlightNeighbours(this.selection.model.id, false);
            }
            var v = this.graph.node(id);
            if (this.selection !== v) {
                this.selection = v;
                v.setClass("selected", true);
                this.highlightNeighbours(id, true);
                this.d3g.classed("hovering", true);
                this.$nodeActionBar.show();
            } else {
                this.selection = null;
                this.d3g.classed("hovering", false);
                this.$nodeActionBar.hide();
            }
        },

        onFocus: function () {
            if (this.selection == null) return;
            var focus = this.focus;
            if (focus != null) {
                focus.setClass("focus", false);
                this.focus = null;
            }
            if (this.selection !== focus) {
                this.focus = this.selection;
                this.focus.setClass("focus", true);
                this.deselect();
            }
            this.render();
        },

        deselect: function () {
            if (this.selection != null) {
                this.selection.setClass("selected", false);
                this.highlightNeighbours(this.selection.model.id, false);
                this.selection = null;
                this.d3g.classed("hovering", false);
                this.$nodeActionBar.hide();
            }
        },

        highlightNeighbours: function (node, highlight) {
            var i, view, nodes = this.graph.neighbors(node),
                edges = this.graph.nodeEdges(node);
            for (i = nodes.length; i--;) {
                view = this.graph.node(nodes[i]);
                view.setClass("highlight", highlight);
            }
            for (i = edges.length; i--;)
                this.graph.edge(edges[i]).d3path.classed("highlight", highlight);
            return this;
        },


        onInfo: function () {
            if (this.selection == null) return;
            if (this.selection.model.get("resourceType") === "node") {
                this.infoView.model = this.selection.model;
                this.infoView.show();
            }
        },


        onResize: function () {
            this.$el.height(Math.min($(window).height() - 120, 800));
            this.resetViewport();
        },

        resetViewport: function () {
            var ow = this.$el.outerWidth() - 2 * this.spacing,      // size of container
                oh = this.$el.outerHeight() - 2 * this.spacing,
                bbox = this.d3g.node().getBBox(),   // size needed by the graph
                gw = Math.max(bbox.width | 0, this.spacing * 2),
                gh = Math.max(bbox.height | 0, this.spacing * 2),
                scale = Math.max(Math.min(ow/gw, oh/gh), 0.125),
                w = gw * scale | 0,
                h = gh * scale | 0,
                tx = (ow - w) / 2 + this.spacing,
                ty = (oh - h) / 2 + this.spacing;
            // translate to center the graph
            this.d3svg.call(this.zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
        }
    });


    ////////////////////////////////////////////////////////////////////////////

    views.ResourceNode = Backbone.View.extend({
        colours: {
            "node":     "rgb(255, 255, 255)",
            "topic":    "rgb(255,165,59)",
            "service":  "rgb(255,99,71)",
            "param":    "rgb(0,255,126)"
        },

        initialize: function (options) {
            _.bindAll(this, "onClick");
            this.label = this.model.get("name");
            this.visible = false;
            this.conditional = !!(this.model.get("conditions").length);

            this.d3g = d3.select(this.el).attr("class", "node").on("click", this.onClick);
            this.d3node = this.d3g.append("circle");
            this.d3text = this.d3g.append("text").attr("text-anchor", "middle").text(this.label);

            this.d3g.classed("conditional", this.conditional);
            this.d3node.attr("style", "fill: " + this.colours[this.model.get("resourceType")] + ";");

            this.height = 32;
            this.width = this.height;
            this.radius = this.height / 2;
        },

        onClick: function () {
            d3.event.stopImmediatePropagation();
            this.trigger("selected", this.model.id);
        },

        setClass: function (c, active) {
            this.d3g.classed(c, active);
            return this;
        },

        render: function () {
            this.d3g.classed("hidden", !this.visible);
            if (this.visible) {
                this.d3node.attr("cx", this.x).attr("cy", this.y).attr("r", this.radius);
                this.d3text.attr("x", this.x).attr("y", this.y);
            }
            return this;
        }
    });


    ////////////////////////////////////////////////////////////////////////////

    views.NodeInfo = views.Modal.extend({
        initialize: function (options) {
            this.$content = this.$el.find(".template-wrapper");
            this.template = _.template($("#ros-board-info-modal").html(), {variable: "data"});
        },

        render: function () {
            var data = this.model != null ? _.clone(this.model.attributes) : {};
            this.$content.html(this.template(data));
            return this;
        }
    });
})();