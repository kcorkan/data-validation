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
    storyFetchFields: ['FormattedID','Name','Project','c_CodeDeploymentSchedule','Iteration','Release','ScheduleState'],
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
    getStoryFilters: function(){
        var release = this.getReleaseRecord();

        if (release == null){
            return [{
                property: 'Feature.Release',
                value: ''
            }];
        }

        if (release.get('Name') == this.allReleasesText){
            return [{
                property: 'Feature',
                operator: '!=',
                value: ''
            }];
        }

        return [{
            property: 'Feature.Release.Name',
            value: release.get('Name')
        },{
            property: 'Feature.Release.ReleaseStartDate',
            value: release.get('ReleaseStartDate')
        },{
            property: 'Feature.Release.ReleaseDate',
            value: release.get('ReleaseDate')
        }];
    },

    getFeatureFilters: function(){

        var release = this.getReleaseRecord();

        if (release == null) {
            return [{
                property: 'Release',
                value: ""
            }];
        }

        if (release.get('Name') == this.allReleasesText){
            return [];
        }

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
            this._fetchData(this.portfolioItemFeature, this.featureFetchFields, this.getFeatureFilters()),
            this._fetchData('HierarchicalRequirement', this.storyFetchFields, this.getStoryFilters()),
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

                var validatorData = featureValidator.ruleViolationData.concat(storyValidator.ruleViolationData);
                this._createSummaryHeader(validatorData);

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
        this._createDetailGrid(ct_grid, validatorData, undefined, undefined, undefined);

    },

    _createSummaryPie: function(ct,validatorData){

        var innerData = [];



        ct.add({
            xtype:'rallychart',
            chartData: {
                series: [{
                    data: innerData,
                    size: '60%',
                    distance: -30,
                    dataLabels: {
                        formatter: function () {
                            return this.y + ' ' + this.point.name;
                        },
                        color: 'white',
                        distance: -30
                    }
                },{
                    data: outerData,
                    size: '80%',
                    innerSize: '60%',
                    dataLabels: {
                        enabled: true,
                        formatter: function () {
                            // display only if larger than 1
                            return this.y > 1 ? '<b>' + Rally.technicalservices.ValidationRules.getStatLabel(this.point.name) + ':</b> ' + this.y + '%'  : null;
                        }

                    }
                }]
            },
            chartConfig: {
                chart: {
                    type: 'pie'
                },
                title: '',
            plotOptions: {
                pie: {
                    center: ['50%','50%'],
                    allowPointSelect: true,
                    showInLegend: false
                }
            }
        }
        });
    },
    _createDetailGrid: function(ct, violationData){

        ct.removeAll();

        var store = Ext.create('Rally.data.custom.Store',{
            data: violationData,
            pageSize: violationData.length
        });

        ct.add({
            xtype:'rallygrid',
            store: store,
            columnCfgs: this._getColumnCfgs(),
            showPagingToolbar: false

        });
    },
    _getColumnCfgs: function(){
        return [{
            dataIndex: 'FormattedID',
            text: 'FormattedID'
        },{
            dataIndex: 'Project',
            text: 'Project'
        },{
            dataIndex: 'violations',
            text:'Issues',
            renderer: this._validatorRenderer,
            flex: 1
        }];
    },
    _validatorRenderer: function(v,m,r){
        var issues = '';
        console.log('renderer',v);
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
            allowNoEntry: true,
            width: '300',
            storeConfig: {
                listeners: {
                    scope: this,
                    load: this._addAllOption
                }
            }
        });
        cb.on('change', this.onReleaseUpdated,this);
    },

    _addAllOption: function(store){
        store.add({Name: this.allReleasesText, formattedName: this.allReleasesText});
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
