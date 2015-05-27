Ext.define('Rally.technicalservices.UserStoryValidationRules',{

    ruleFnPrefix: 'ruleFn_',
    requiredFields: ['Iteration','c_CodeDeploymentSchedule'],

    constructor: function(config){
        Ext.apply(this, config);
    },

    getRules: function(){
        var ruleFns = [],
            ruleRe = new RegExp('^' + this.ruleFnPrefix);

        for (var fn in this)
        {
            if (ruleRe.test(fn)){
                ruleFns.push(fn);
            }
        }
        return ruleFns;
    },

    ruleFn_missingFields: function(r){
        var missingFields = [];

        _.each(this.requiredFields, function(f){
            if (!r.get(f)){
                missingFields.push(f);
            }
        });
        if (missingFields.length === 0){
            return null;
        }
        return Ext.String.format('Missing fields: {0}', missingFields.join(','));
    },
    ruleFn_storiesPlannedByFeatureTargetSprint: function(r){
        /**
         * Iteration should be on or before Feature.FTS
         */
        return null;
    }

});

