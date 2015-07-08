Ext.define("ts-data-validation", {
    extend: 'Rally.app.App',
    componentCls: 'app',
    logger: new Rally.technicalservices.Logger(),

    /**
     * Configurations
     */
    allReleasesText: 'All Releases',
    portfolioItemFeature: 'PortfolioItem/Feature',
    featureFetchFields: ['FormattedID','Name','Project','Release','c_FeatureDeploymentType','c_FeatureTargetSprint','c_CodeDeploymentSchedule','State','AcceptedLeafStoryCount','LeafStoryCount'],
    storyFetchFields: ['FormattedID','Name','Project','c_CodeDeploymentSchedule','Iteration','Release','ScheduleState','Feature','Owner'],
    iterationFetchFields: ['Name','StartDate','EndDate','State','ObjectID'],

    featureRequiredFields: ['Release','c_FeatureTargetSprint','c_FeatureDeploymentType','c_CodeDeploymentSchedule','State'],
    storyRequiredFields: ['Release','c_CodeDeploymentSchedule'],

    features: [],
    stories: [],
    iterations: [],
    
    data_collected: false, /* true means we've gotten the stories and features we need */
    
    chartColors: [ '#2f7ed8', '#8bbc21', '#910000',
        '#492970', '#f28f43', '#145499','#77a1e5', '#c42525', '#a6c96a',
        '#7cb5ec', '#434348', '#90ed7d', '#f7a35c', '#8085e9','#aa1925',
        '#f15c80', '#e4d354', '#2b908f', '#f45b5b', '#91e8e1','#1aadce',
        '#4572A7', '#AA4643', '#89A54E', '#80699B', '#3D96AE',
        '#DB843D', '#92A8CD', '#A47D7C', '#B5CA92'],
    
    launch: function() {
        this._addReleaseSelector();
        this._addTargetSprintSelector();
    },
    getFeatureRequiredFields: function(){
        return this.featureRequiredFields;
    },
    getStoryRequiredFields: function(){
        return this.storyRequiredFields;
    },
    getIterationFilters: function(){
        var release = this.getSelectedReleaseRecord();

        if (release == null || release.get('Name') == this.allReleasesText){
            return [];
        }

        var filters = Rally.data.wsapi.Filter.and([{
            property: 'StartDate',
            operator: '<',
            value: release.get('ReleaseDate')
        },{
            property: 'EndDate',
            operator: '>',
            value: release.get('ReleaseStartDate')
        }]);
        return filters;
    },

    getReleaseFilters: function(){

        var release = this.getSelectedReleaseRecord();

        return [{
            property: 'Release.Name',
            value: release.get('Name')
        },{
            property: 'Release.ReleaseStartDate',
            value: release.get('ReleaseStartDate')
        },{
            property: 'Release.ReleaseDate',
            value: release.get('ReleaseDate')
        }];
    },

    gatherData: function(){
        this.logger.log('gatherData');
        this.data_collected = false;
        
        this.setLoading(true);
        this.getBody().removeAll();
        
        var promises = [
            this._fetchData(this.portfolioItemFeature, this.featureFetchFields, this.getReleaseFilters()),
            this._fetchData('HierarchicalRequirement', this.storyFetchFields, this.getReleaseFilters()),
            this._fetchData('Iteration', this.iterationFetchFields, this.getIterationFilters())
        ];

        Deft.Promise.all(promises).then({
            scope: this,
            success: function(results){
                this.setLoading("Analyzing");
                this.logger.log('_fetchData success', results);

                this.features = this._filterOutExcludedProjects(results[0]);
                this.stories = this._filterOutExcludedProjects(results[1]);
                this.iterations = results[2];
                this.data_collected = true;
                
                this.analyzeData();
            },
            failure: function(operation){
                this.setLoading(false);
                this.logger.log('_fetchData failure', operation);
            }
        });
    },
    
    analyzeData: function() {
        
        if ( !this.data_collected ) {
            this.logger.log("Data Collected: ", this.data_collected);
            return;
        }
        
        console.log('selected target:', this.getSelectedTargetSprint());
        
        var featureRules = Ext.create('Rally.technicalservices.FeatureValidationRules',{
            stories: this.stories,
            iterations: this.iterations,
            targetSprint: this.getSelectedTargetSprint()
        });
        
        var featureValidator = Ext.create('Rally.technicalservices.Validator',{
                validationRuleObj: featureRules,
                records: this.features
            });

        var storyRules = Ext.create('Rally.technicalservices.UserStoryValidationRules',{});
        var storyValidator = Ext.create('Rally.technicalservices.Validator',{
                validationRuleObj: storyRules,
                records: this.stories
            });

        this.validatorData = featureValidator.ruleViolationData.concat(storyValidator.ruleViolationData);
        this._createSummaryHeader(this.validatorData);
        this.setLoading(false);
    }, 
    
    _filterOutExcludedProjects: function(artifacts) {
        var exclude_projects = this.getSetting('excludeProjects');
        var current_project_oid = this.getContext().getProject().ObjectID;
        
        if ( Ext.isEmpty(exclude_projects) ) {
            return artifacts;
        }
        if ( !Ext.isArray(exclude_projects) ) { 
            exclude_projects = exclude_projects.split(','); 
        }
        
        // don't exclude the currently selected project
        var current_project_regex = new RegExp("" + current_project_oid);

        var filtered_exclude_projects = Ext.Array.filter(exclude_projects, function(exclude_project){            
            return ! current_project_regex.test(exclude_project);
        });
                
        var keepers =  Ext.Array.filter(artifacts, function(artifact){
            var keep = true;
            Ext.Array.each(filtered_exclude_projects, function(exclude_project){
                var exclude_project_regex = new RegExp(exclude_project);
                
                if (exclude_project_regex.test(artifact.get('Project')._ref) ){
                    keep = false;
                }

            });
            return keep;
        });
        
        return keepers;
    },
    
    _createSummaryHeader: function(validatorData){
        var ct_chart = this.down('#ct-chart');
        if (!ct_chart){
            var ct_chart = this.getBody().add({
                itemId: 'ct-chart',
                xtype: 'container',
                flex: 1
            });
        }
        this._createSummaryChart(ct_chart, validatorData);

        var ct_detail_grid = this.down('#ct-grid');
        if (!ct_detail_grid){
            var ct_detail_grid = this.getBody().add({
                xtype: 'container',
                itemId: 'ct-grid'
            });
        }
        this._createDetailGrid(ct_detail_grid, validatorData);
    },

    _createSummaryChart: function(ct,validatorData){
        var me = this;
        var dataHash = {}, projects = [], types = [], rules = [];

        _.each(validatorData, function(obj){
            
            if (!_.contains(projects,obj.Project)){
                projects.push(obj.Project);
            }
            if (!_.contains(types, obj._type)){
                types.push(obj._type);
            }
            if (!dataHash[obj.Project]){
                dataHash[obj.Project] = {};
            }
            if (!dataHash[obj.Project][obj._type]){
                dataHash[obj.Project][obj._type] = {};
            }
            _.each(obj.violations, function(v){
                if (!_.contains(rules, v.rule)){
                    rules.push(v.rule);
                }
                dataHash[obj.Project][obj._type][v.rule] = (dataHash[obj.Project][obj._type][v.rule] || 0) + 1;
            });
        });

        projects.sort();

        var series = [];

        var stack_by_type = {
            'project': 'a',
            'iteration': 'a',
            'portfolioitem/feature': 'a',
            'hierarchicalrequirement': 'a',
            'task': 'a' 
        };
        
        _.each(types, function(type){
            _.each(rules, function(r){
                var data = [];
                _.each(projects, function(p){
                    if (dataHash[p] && dataHash[p][type]){
                        data.push(dataHash[p][type][r] || 0);
                    } else {
                        data.push(0);
                    }
                });
                
                series.push({
                    name: Rally.technicalservices.ValidationRules.getUserFriendlyRuleLabel(r),
                    data: data,
                    stack: stack_by_type[type],
                    showInLegend: Ext.Array.sum(data) > 0,
                    events: {
                        click: function(event) {
                            me.logger.log('event:', event);
                            
                            var team = event.point.category;
                            var rule_name = event.point.series.name;
                            me.logger.log('team/rule', team, rule_name);
                                                        
                            var grid = me.down('#detail-grid');
                            grid.getStore().clearFilter(true);
                            
                            grid.getStore().filterBy(function(record){
                                var violations = record.get('violations'),
                                    filter = false;
                                if (violations){
                                    _.each(violations, function(v){
                                        //me.logger.log(v.rule, Rally.technicalservices.ValidationRules.getUserFriendlyRuleLabel(v.rule), v);
                                        //if (v.rule == rule_name || Rally.technicalservices.ValidationRules.getUserFriendlyRuleLabel(v.rule) == rule_name ){
                                        if ( me.last_filter == team ) {
                                            filter = true;
                                        } else if ( team == record.get('Project')) {
                                            filter = true;
                                        }
                                    });
                                }
                                return filter;
                            });

                            me.last_filter = team; // so that a second click unchooses
                        }
                    }
                });
            });
        });

        this.logger.log("Series:", series);
        var categories = Ext.Array.map(projects, function(project) { return _.last(project.split('>')); });
        
        var selectedRelease = this.getSelectedReleaseRecord();
        
        var subtitle_text = (selectedRelease ? '<b>' + selectedRelease.get('Name')  + '</b>': 'All Releases');

        if (this.down('#summary-chart')){
            this.down('#summary-chart').destroy();
        }
        var chart = ct.add({
            xtype: 'rallychart',
            itemId: 'summary-chart',
            loadMask: false,
            chartData: {
                series: series,
                categories: categories
            },
            chartConfig: {
                colors: me.chartColors,
                chart: {
                    type: 'bar'
                },
                title: {
                    text: 'Work Item Field Issues'
                },
               /* subtitle: {
                    text: subtitle_text
                },*/
                legend: {
                    align: 'center',
                    verticalAlign: 'bottom'
                },
                xAxis: {
                    categories: projects
                },
                yAxis: {
                    title: 'Project'
                },
                plotOptions: {
                    series: {
                       stacking: 'normal'
                    }
                }
            }
        });
        ct.setSize(chart.getWidth(), chart.getHeight());
    },
    
    _createDetailGrid: function(ct, violationData){
        ct.removeAll();

        var store = Ext.create('Rally.data.custom.Store',{
            data: violationData,
            pageSize: violationData.length,
            groupField: 'Project',
            groupDir: 'ASC',
            remoteSort: false,
            getGroupString: function(record) {
                return record.get('Project');
            }
        });

        ct.add({
            xtype:'rallygrid',
            store: store,
            itemId: 'detail-grid',
            columnCfgs: this._getColumnCfgs(),
            showPagingToolbar: false,
            features: [{
                ftype: 'groupingsummary',
                groupHeaderTpl: '{name} ({rows.length})',
                startCollapsed: true
            }]
        });
    },
    _getColumnCfgs: function(){
        var me = this;
        return [{
            dataIndex: 'FormattedID',
            text: 'id',
            renderer: function(value,meta_data,record) {
                var url = Rally.nav.Manager.getDetailUrl(record);
                var link = "<a target='_blank' href='" + url + "'>" + value + "</a>";
                
                
                return link;
            }
        },
        {
            dataIndex: 'violations',
            text:'Issues',
            renderer: this._validatorRenderer,
            flex: 1
        }];
    },
    _validatorRenderer: function(v,m,r){
        var issues = '';
        if (v && v.length > 0){
            _.each(v, function(va){
                issues += va.text + '<br/>';
            });
        }
        return issues;
    },
    _fetchData: function(modelType, fetchFields, filters){

        var deferred = Ext.create('Deft.Deferred'),
            store = Ext.create('Rally.data.wsapi.Store',{
                model: modelType,
                limit: 'Infinity',
                fetch: fetchFields,
                filters: filters
        });

        store.load({
            scope: this,
            callback: function(records, operation, success){
                if (success){
                    deferred.resolve(records);
                } else {
                    deferred.reject(operation);
                }
            }
        });
        return deferred;
    },

    _addTargetSprintSelector: function() {
        this.logger.log('_addTargetSprintSelector');
        var cb = this.getHeader().add({
            xtype: 'rallyfieldvaluecombobox',
            model: Ext.identityFn('PortfolioItem/Feature'),
            field: 'c_FeatureTargetSprint',
            itemId: 'cb-targetsprint',
            fieldLabel: 'Target Sprint',
            labelAlign: 'right',
            value: 'R4 Sprint 6',
            stateId: 'techservices.rally.validator.targetsprint',
            stateEvents: ['change'],
            stateful: true,
            allowNoEntry: false,
            width: '300'
        });
        cb.on('change', this.analyzeData,this);
    },
    
    _addReleaseSelector: function(){
        this.logger.log('_addReleaseSelector');
        var cb = this.getHeader().add({
            xtype: 'rallyreleasecombobox',
            itemId: 'cb-release',
            fieldLabel: 'Release',
            labelAlign: 'right',
            allowNoEntry: false,
            width: '300'
        });
        cb.on('change', this.gatherData,this);
    },

    getSelectedReleaseRecord: function(){
        if (this.down('#cb-release')){
            return this.down('#cb-release').getRecord();
        }
        return null;
    },

    getSelectedTargetSprint: function(){
        if (this.down('#cb-targetsprint')){
            return this.down('#cb-targetsprint').getValue();
        }
        return null;
    },

    
    getHeader: function(){
        this.logger.log('getHeader');

        if (this.down('#ct-header')){
            return this.down('#ct-header');
        }

        return this.add({
            xtype: 'container',
            itemId: 'ct-header',
            layout: {type: 'hbox'},
            padding: 10
        });
    },

    getBody: function(){
        this.logger.log('getBody');

        if (this.down('#ct-body')){
            return this.down('#ct-body');
        }
        return this.add({
            xtype: 'container',
            itemId: 'ct-body'
        });
    },
    
    getSettingsFields: function () {
        var fields = [];

        fields.push({
            name: 'excludeProjects',
            xtype: 'rallymultiobjectpicker',
            modelType: Ext.identityFn('Project'),
            margin: '10px 0 150px 0',
            fieldLabel: 'Exclude Projects'
        });
        
        
        return fields;
    },
    
    isExternal: function(){
        return typeof(this.getAppId()) == 'undefined';
    },
    
    //onSettingsUpdate:  Override
    onSettingsUpdate: function (settings){
        this.logger.log('onSettingsUpdate',settings);
        Ext.apply(this, settings);
        this.launch();
    }
});
