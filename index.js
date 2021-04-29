const asana = require('asana');
const Workspace = require('./src/models/workspace.model');
const Project = require('./src/models/project.model');
const { input }  = require('console-input');
const spinner = require('cli-spinner').Spinner;
let workspaces = [];
let projects = [];
let tasks = [];
let curr_workspace = {};
let client = '';
let request_spinner = new spinner('Requesting... %s');
let curr_proj = {};
let task_details = [];
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

function startSpinner(){
    request_spinner.setSpinnerString('|/-\\');
    request_spinner.start();
}

function stopSpinner(){
    request_spinner.stop();
}

async function setAsanaClient() {
    client = asana.Client.create({"defaultHeaders": {"asana-enable": "new_user_task_lists"}}).useAccessToken('_your_asana_api_key_'); 
}
 
function setWorkspace(gid, name, resource_type) {
     workspaces.push(new Workspace(gid, name, resource_type));
}

function setProject(gid, name, resource_type) {
    projects.push({ gid: gid, name: name, resource_type: resource_type });
}
function setTasks(gid, name, resource_type) {
    tasks.push({ gid: gid, name: name, resource_type: resource_type });
}

// DEBUG MODE BELOW
async function main() {
    try {
        await setAsanaClient();

    } catch (error) {
        console.log("\nError connecting to the internet.");
        stopSpinner();
    }
    await client.users.me().then( async function(me) {
        me.workspaces.forEach((data) => {
           setWorkspace(data.gid, data.name, data.resource_type);
        })
        console.log("\nSelect workspace to migrate. Input number of choice. \n");
        var x = 0;
        workspaces.forEach((data) => {
            console.log(`${x++}: ${data.name}`);
        });
        let ws = input('\nWorkspace: ');
        console.log(`\nSelected workspace:\n`); 
        curr_workspace = workspaces[ws];
        console.log(curr_workspace);     
    });
    console.log("\n");
    console.log('<----------------- PROJECTS ON ' + curr_workspace.name + ' ----------------->');    
    console.log("\n"); 
    startSpinner();
    await getProjects(curr_workspace.gid);     
    console.log("\n"); 
    await listProjects();
    stopSpinner();
    let project_id = input('\nSelect Project to migrate. Input project id: ');
    let select_project = projects.find( project => project.gid == project_id);
    curr_proj = new Project(select_project.gid,select_project.name, select_project.resource_type)
    console.log(`\nSelected project:\n`); 
    console.log(curr_proj); 
    console.log("\n");    
    startSpinner();
    await getTasksOnProject(curr_proj.gid);
    stopSpinner();
    console.log("\n");
    console.log('<----------------- TASKS ON ' + curr_proj.name + ' ----------------->');    
    console.log("\n"); 
    await listTasks();
    startSpinner();
    await getTask().then( async () => {
        stopSpinner();
        console.log('Generating csv...');
        generateCsv(task_details)

    });
}

async function getProjects(work_space_gid){
    await client.projects.getProjectsForWorkspace(work_space_gid, {opt_pretty: true})
    .then( async (result) => {
        if(result.data.length > 0) {
            result.data.forEach((data) => {
                setProject(data.gid, data.name, data.resource_type);
            });
            if(result._response.next_page != null) {
               await getOffsetProjects(work_space_gid, result._response.next_page.offset);
            }
        }
    }); 
}

async function getOffsetProjects(work_space_gid, offset) {
    await client.projects.getProjectsForWorkspace(work_space_gid, { offset : offset,opt_pretty: true})
    .then( async (result) => {
        if(result.data.length > 0) {  
            result.data.forEach((data) => {
                 setProject(data.gid, data.name, data.resource_type);
            });
            if(result._response.next_page != null) {
                 await getOffsetProjects(work_space_gid, result._response.next_page.offset);
            }     
        }
    });
}

async function listProjects() {
    projects.forEach((data) => {
        console.log(`${data.gid}: ${data.name}`);
    })
}

async function getTasksOnProject(project_gid) {
    await client.tasks.getTasksForProject(project_gid, {opt_pretty: true})
        .then( async (result) => {
            if(result.data.length > 0) {
                result.data.forEach((data) => {
                    setTasks(data.gid, data.name, data.resource_type);
            });
            if(result._response.next_page != null) {
                   await getOffsetTasks(project_gid, result._response.next_page.offset);
            }
        }
    });
}

async function getOffsetTasks(project_gid, offset) {
    await client.tasks.getTasksForProject(project_gid, { offset : offset,opt_pretty: true})
    .then( async (result) => {
        if(result.data.length > 0) {  
            result.data.forEach((data) => {
                setTasks(data.gid, data.name, data.resource_type);
            });
            if(result._response.next_page != null) {
                await getOffsetTasks(project_gid, result._response.next_page.offset);
            }     
        }
    });
}

async function listTasks() {
    tasks.forEach((data) => {
        console.log(`${data.gid}: ${data.name}`);
    })
}

async function getTask() {
    var x = 0;
    return new Promise((resolve, reject) => {
        tasks.sort(function(a, b){
            var keyA = a.gid;
                keyB = b.gid;
            if(keyA > keyB) return -1;
            if(keyA < keyB) return 1;
            return 0;
        });
        tasks.forEach( async (data, i) => {
            setTimeout( async function(){
                console.log(i)
                await client.tasks.getTask(data.gid, { options : { pretty: true, fields:  ['gid', 'name', 'approval_status', 'completed', 'completed_at', 'completed_by']}}).then( async (data) => {   
                   var result = {
                            task_id : data.gid,
                            created_at : data.created_at,
                            completed_at : data.completed_at,
                            last_modified : data.modified_at,
                            name: data.name,
                            section: '',
                            assignee: data.assignee != null ? data.assignee.name : null,
                            assignee_email : data.assignee != null ? await getUserDetails(data.assignee.gid) : '',
                            start_date: data.start_on != null ? data.start_on : '',
                            due_date: data.due_at != null ? data.due_at : '',
                            tags : data.tags.map(  (tags) => { return tags.name; }).join(","),
                            notes: data.notes,
                            projects: data.projects.map(  (tags) => { return tags.name; }).join(","),
                            parent_task : data.parent  != null ?  data.parent.name : null,
                            priority : data.custom_fields.map(  (cs) => {
                                return cs.enum_value != null ? cs.enum_value.name : '';
                            }),
                            estimated_hours : ''
                        };
                    task_details.push(result);  
                    x++;
                    if (x === tasks.length) resolve();
                }).catch( (e) => {
                    console.log('Please check internet connection.')
                })
            }, i * 300);
        })
    });
}
  
async function getUserDetails(userGid){
    var email = await client.users.getUser(userGid, {opt_pretty: true}).then( async (result) => {
        return result.email;
    });
    return email;  
}

async function generateCsv(data) {
    var csvWriter = createCsvWriter({
        path: 'tasks.csv',
        header: [
          {id: 'task_id', title: 'Task ID'},
          {id: 'created_at', title: 'Created At'},
          {id: 'completed_at', title: 'Completed At'},
          {id: 'last_modified', title: 'Last Modified'},
          {id: 'name', title: 'Name'},
          {id: 'section', title: 'Section'},
          {id: 'assignee', title: 'Assignee'},
          {id: 'assignee_email', title: 'Assignee Email'},
          {id: 'start_date', title: 'Start Date'},
          {id: 'due_date', title: 'Due Date'},
          {id: 'tags', title: 'Tags'},
          {id: 'notes', title: 'Notes'},
          {id: 'projects', title: 'Projects'},
          {id: 'parent_task', title: 'Parent Task'},
          {id: 'priority', title: 'Priority'},
          {id: 'estimated_hours', title: 'Estimated Hours'},
        ]
      });
    csvWriter.writeRecords(data).then(()=> console.log('The CSV file was written successfully'));
}


main();