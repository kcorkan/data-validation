Ext.define('Rally.technicalservices.FeatureValidationRules',{
    extend: 'Rally.technicalservices.ValidationRules',

    requiredFields: undefined,
    iterations: [],
    stories: [],

    constructor: function(config){
        Ext.apply(this, config);
        this.requiredFields = ['Release','c_FeatureTargetSprint','c_FeatureDeploymentType','c_CodeDeploymentSchedule','State','DisplayColor'];

    },
    ruleFn_stateSynchronization: function(r) {
        /**
         * State == Done,
         * then all user stories should be accepted
         * AND
         * if All user stories == Accepted,
         * State should be Done
         */

        var featureDone = r.get('State') ? r.get('State').Name === 'Done' : false ,
            storiesAccepted = r.get('AcceptedLeafStoryCount') === r.get('LeafStoryCount');

        if (featureDone === storiesAccepted){
            return null;
        }
        if (featureDone){
            return Ext.String.format('Feature is Done but not all stories are accepted ({0} of {1} accepted)', r.get('AcceptedLeafStoryCount'), r.get('LeafStoryCount'));
        }
        return Ext.String.format('Feature state ({0}) should be Done because all stories are accepted.', r.get('State').Name);
    },
    ruleFn_featureTargetSprintMatchesRelease: function(r){
        /**
         * FTS == R4.xxx, then Release should be Release 4
         *
         */
        var fts = r.get('c_FeatureTargetSprint'),
            release = r.get('Release').Name;

        var matches = release.match(/^Release\s+(\d+)/);
        if (matches){
            var re = new RegExp('^R' + matches[1]);
            if (re.test(fts)){
                return null;
            }
        }
        return Ext.String.format('Feature Target Sprint ({0}) does not match Release ({1})',fts, release);

    },
    ruleFn_storiesPlannedByFeatureTargetSprint: function(r){
        /**
         * FTS == R4.xxx,
         * then all US.Iteration should be scheduled in or before R4.xxx
         */
        return null;
    },
    ruleFn_featureStateShouldMatchTargetSprint: function(r){
        /**
         * FTS == R4.xxx,
         * and R4.xxx == iteration (R4.xxx),
         * and iteration (R4.xxx) == done, then
         * FTS.State should be Done
         */
        return null;
    }
});
