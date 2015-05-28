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

    launch: function() {
        this._addReleaseSelector();
    },
    getFeatureRequiredFields: function(){
        return this.featureRequiredFields;
    },
    getStoryRequiredFields: function(){
        return this.storyRequiredFields;
    },
    getIterationFilters: function(){
        var release = this.getReleaseRecord();

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

        var release = this.getReleaseRecord();

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

    onReleaseUpdated: function(cb){
        this.logger.log('onReleaseUpdated',cb.getValue());
        this.setLoading(true);
        var promises = [
            this._fetchData(this.portfolioItemFeature, this.featureFetchFields, this.getReleaseFilters()),
            this._fetchData('HierarchicalRequirement', this.storyFetchFields, this.getReleaseFilters()),
            this._fetchData('Iteration', this.iterationFetchFields, this.getIterationFilters())
        ];

        Deft.Promise.all(promises).then({
            scope: this,
            success: function(records){
                this.setLoading(false);
                this.logger.log('_fetchData success', records);

                var featureRules = Ext.create('Rally.technicalservices.FeatureValidationRules',{
                    stories: records[1],
                    iterations: records[2]
                }),
                    featureValidator = Ext.create('Rally.technicalservices.Validator',{
                    validationRuleObj: featureRules,
                    records: records[0]
                });

                var storyRules = Ext.create('Rally.technicalservices.UserStoryValidationRules',{}),
                    storyValidator = Ext.create('Rally.technicalservices.Validator',{
                        validationRuleObj: storyRules,
                        records: records[1]
                    });

                this.logger.log('featureStats',featureValidator.ruleViolationData, storyValidator.ruleViolationData);

                this.validatorData = featureValidator.ruleViolationData.concat(storyValidator.ruleViolationData);
                this._createSummaryHeader(this.validatorData);

            },
            failure: function(operation){
                this.setLoading(false);
                this.logger.log('_fetchData failure', operation);
            }
        });
    },
    _createSummaryHeader: function(validatorData){
        this.logger.log('createProjectPies',validatorData);

        var ct_summary = this.getBody().add({
            xtype: 'container',
            layout: {type: 'hbox'}
        });

        var ct_chart = ct_summary.add({
            xtype: 'container',
            flex: 1
        });
        this._createSummaryPie(ct_chart, validatorData);

        var ct_grid = ct_summary.add({
            xtype: 'container',
            flex: 1
        });
        this._createDetailGrid(ct_grid, validatorData);

    },

    _createSummaryPie: function(ct,validatorData){

        var dataHash = {};
        _.each(validatorData, function(r){
            _.each(r.violations, function(v){
                dataHash[v.rule] = (dataHash[v.rule] || 0) + 1;
            });
        });

        var innerData = [];
        _.each(dataHash, function(val, key) {
            innerData.push({
                name: Rally.technicalservices.ValidationRules.getUserFriendlyRuleLabel(key),
                ruleName: key,
                y: val
            });
        });

        var grid = this.down('#detail-grid');

        var me = this;
        ct.add({
            xtype: 'rallychart',
            chartData: {
                series: [{
                    point: {
                        events: {
                            select: function () {
                                var ruleName = this.ruleName;
                                var grid = me.down('#detail-grid');

                                grid.getStore().clearFilter(true);

                                grid.getStore().filterBy(function(rec){
                                    var violations = rec.get('violations'),
                                        filter = false;
                                    if (violations){
                                        _.each(violations, function(v){
                                            if (v.rule == ruleName){
                                                filter = true;
                                            }
                                        });
                                    }
                                    return filter;
                                });

                            },
                            unselect: function(){
                                if (this.selected){
                                    me.down('#detail-grid').getStore().clearFilter();
                                }
                            }
                        }
                    },
                    data: innerData,

                    dataLabels: {
                        enabled: false,

                        formatter: function () {
                            return ''; //Ext.String.format('{0} ({1})',this.point.name, this.point.y);
                        },
                        distance: 25
                    }
                }]
            },
            chartConfig: {
                chart: {
                    type: 'pie'
                },
                title: '',
                legend: {
                    align: 'center',
                    verticalAlign: 'bottom',
                    layout: 'vertical'
                },
                plotOptions: {
                    pie: {
                        //center: ['50%','50%'],
                        allowPointSelect: true,
                        showInLegend: true,
                        tooltip: {
                            headerFormat: '',
                            pointFormat: '{point.name}: <b>{point.y}</b><br/>'
                        }
                    }
                }
            }
        });
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
        return [{
            dataIndex: 'FormattedID',
            text: 'FormattedID',
            renderer: this._artifactRenderer
        },{
            dataIndex: 'violations',
            text:'Issues',
            renderer: this._validatorRenderer,
            flex: 1
        }];
    },
    _artifactRenderer: function(v,m,r){
        return v;
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
        cb.on('change', this.onReleaseUpdated,this);
    },


    getReleaseRecord: function(){
        if (this.down('#cb-release')){
            return this.down('#cb-release').getRecord();
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
            layout: {type: 'hbox'}
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
    }
});
