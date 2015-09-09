#Data Validation

App in progress, depends on several custom fields.  

###Rules:
####Feature - Past TargetSprint not done 
*  This rule only applies if the feature State is not "Done" ("Done" is defined as state = "Done" or state = "Operate")
* If the FeatureTargetSprint field is before the currently chosen target sprint (in the data validation dropdown), then this rule is triggered.  The order of the feature target sprints is alphabetical.  

####Missing Required fields.  
This rule is triggered if any of the following fields are missing:
*  Features: Release, FeatureTargetSprint, FeatureDeploymentType, CodeDeploymentSchedule, State, DisplayColor, PlannedStartDate, PlannedEndDate
*  Stories:  Owner, Feature

####Feature - State is not aligned with Story States:
This rule is triggered if either of the following is true:
*  If the feature State is done (State = "Done" or State = "Operate") but not all stories are in the accepted state
*  If the feature State is not done, but all stories are accepted

####Feature - Display color not valid
This rule is triggered if the feature DisplayColor is not one of the valid colors that classify a risk.  Those colors are:
        On Track      :  green (107c1e)
        High Risk     :  pink, orange or light orange (df1a7b, ee6c19, f9a814)
        Moderate Risk :  yellow (fce205)
        Not Started   :  white
        Completed     :  grey

####Feature - Feature is Risk
If the feature DisplayColor is one of the colors mapped as "High Risk" above, then this rule will be triggered.  

####User Story - In-Progress with Unscheduled iteration
This rule is triggered if the user story ScheduleState = In-Progress but the Iteration = Unscheduled

####User Story - Past Iteration not complete
This rule is triggered if the user story is assigned to an iteration where the Iteration.EndDate is before today but the story is not in the Accepted ScheduleState

####User Story - Blocked Fields not populated
This rule is triggered if a User Story is Blocked but the following fields are not populated:  BlockerCategory, BlockerOwnerFirstLast, BlockerState

####User Story - Blocked but not in progress
This rule is triggered if a user story is Blocked but the ScheduleState is not In-Progress

#####FAQ

######Why am I not seeing all the teams in my project scope? 

The report will only show teams where data is not valid.  If none of a team's data in the selected release violates the rules, the team will not be shown here.  

While the bar chart should have every team that has stories or features in the current release where rules are violated, the axis on the chart does not list all teams because there a too many to list in this view.  

There is an App setting in the App called "Exclude Projects" that allows the person who set the app up to exclude certain projects from validation.  Any project selected there will not be evaluated.  
