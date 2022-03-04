'use strict';

const IDENTITY_COEFFS = '1,0,0,0,1,0,0,0,1';

// modules =================================================
const express        = require('express');
const app            = express();
const bodyParser     = require('body-parser');
const path           = require('path');
const fs             = require('fs');
const ps             = require('python-shell');
const Database       = require('better-sqlite3');

// configuration ===========================================
let port = process.env.PORT || 3000; // set our port
app.use(bodyParser.json()); // for parsing application/json
app.use(express.static(__dirname + '/client')); // set the static files location /public/img will be /img for users
const shell = new ps.PythonShell('./cp_interpreter.py', {});

// database ===========================================
const db = new Database('verso.db', {});
let initWorkflowTable = (db) => {
    let query = db.prepare('CREATE TABLE IF NOT EXISTS Workflows ('
        + 'progName TEXT NOT NULL,'
        + 'progText TEXT NOT NULL'
        + ');');
    query.run();
};

let workflowTableIsEmpty = (db) => {
    let query = db.prepare('SELECT * FROM Workflows;');
    let maybeRows = query.all();
    return maybeRows.length === 0;
};

let addWorkflow = (db, workflowName, workflowText) => {
    let query = db.prepare('INSERT INTO Workflows '
        + `VALUES ('${workflowName}', '${workflowText}');`);
    query.run();
};

initWorkflowTable(db);
if (workflowTableIsEmpty(db)) {
    console.log('Seeding database!');
    seedDatabase(db);
}


/* Keep references to the name and Express response object for the current
 * RPC and set the shell.on handler once only, using a lookup table that
 * checks the name of the RPC and handles it appropriately. This is because
 * we cannot unbind shell.on handlers and so cannot set them in routes. */
shell.currRpcResponse = undefined;
shell.currRpcName = '';
shell.on('message', (message) => {
    if (shell.currRpcName === 'choosePoint') {
        let xyPair = message;
        let parsedPair = xyPair.split(',').map(s => parseInt(s));
        shell.currRpcResponse.status(200).json({
            results: {
                x: parsedPair[0],
                y: parsedPair[1]
            }
        });
        shell.currRpcResponse = undefined;
        shell.currRpcName = '';
    }
    else if (shell.currRpcName === 'detectFaceBoxes') {
        try {
            let arrayOfArrays = JSON.parse(message);
            let boxes = arrayOfArrays.map(box => {
                return {
                    topLeftX: box[0],
                    topLeftY: box[1],
                    width: box[2],
                    height: box[3]
                }
            });
            shell.currRpcResponse.status(200).json({
                results: boxes
            });
            shell.currRpcResponse = undefined;
            shell.currRpcName = '';
        }
        catch (e) {
            console.log(`PC --> Could not parse faces.`);
        }
    }
    else if (shell.currRpcName === 'generatePreview') {
        console.log(`PC (preview) --> ${message}`);
        shell.currRpcResponse.sendFile(__dirname + '/volatile/plot_preview.svg');
        shell.currRpcResponse = undefined;
        shell.currRpcName = '';
    }
    else if (shell.currRpcName === 'generateInstructions') {
        let instText = fs.readFileSync(__dirname + '/volatile/plot_instructions.txt')
                         .toString();
        let instructions = instText.split('\n').filter(inst => !!inst);
        shell.currRpcResponse.status(200).json({
            instructions: instructions
        });
        shell.currRpcResponse = undefined;
        shell.currRpcName = '';
    }
    else if (shell.currRpcName === 'takePhoto') {
        shell.currRpcResponse.sendFile(__dirname + '/volatile/camera-photo.jpg');
        shell.currRpcResponse = undefined;
        shell.currRpcName = '';
    }
    else if (shell.currRpcName === 'warpLastPhoto') {
        shell.currRpcResponse.sendFile(__dirname + '/volatile/camera-photo-warped.jpg');
        shell.currRpcResponse = undefined;
        shell.currRpcName = '';
    }
    else {
        console.log(`PC --> ${message}`);
    }
});

// routes and start ========================================

let attachRoutesAndStart = () => {

    app.get('/workflows', (req, res) => {
        let query;
        if (req.query.workflowName) {
            query = db.prepare('SELECT * FROM Workflows '
                + `WHERE progName='${req.query.workflowName}'`);
            try {
                let row = query.get();
                res.status(200).json({
                    workflows: row
                });
            }
            catch (e) {
                res.status(404).send();
            }
        }
        else {
            query = db.prepare('SELECT * FROM Workflows ORDER BY progName ASC;');
            try {
                let rows = query.all();
                res.status(200).json({
                    workflows: rows
                });
            }
            catch (e) {
                res.status(404).send();
            }
        }
    });

    app.put('/workflows', (req, res) => {
        let workflowName = req.query.workflowName;
        let workflowText = req.query.workflowText;
        if (!(workflowName && workflowText)) {
            res.status(400).send();
            return;
        }
        workflowText = workflowText.replaceAll('\'', '\'\'');
        workflowText = workflowText.replaceAll('\\n', '\n');
        let maybeRows = db.prepare(`SELECT * FROM Workflows WHERE progName='${workflowName}'`)
                         .all();
        if (maybeRows.length !== 0) {
            // Update existing workflow text
            console.log('Resolve PUT -> UPDATE');
            let updateQuery = db.prepare(
                'UPDATE Workflows '
                + `SET progText='${workflowText}' `
                + `WHERE progName='${workflowName}'`
            );
            let info = updateQuery.run();
            if (!info.changes) {
                res.status(500).send();
            }
            else {
                res.status(200).send();
            }
        }
        else {
            // Insert new workflow
            console.log('Resolve PUT -> INSERT');
            let updateQuery = db.prepare(
                'INSERT INTO Workflows '
                + '(progName, progText) '
                + `VALUES ('${workflowText}', '${workflowName}')`
            );
            let info = updateQuery.run();
            if (!info.changes) {
                res.status(500).send();
            }
            else {
                res.status(200).send();
            }
        }
    });

    app.get('/machine/drawEnvelope', (req, res) => {
        shell.send('draw_envelope');
        res.status(200).send();
    });

    app.get('/machine/drawToolpath', (req, res) => {
        let svg_string = req.query['svgString']
        shell.send('draw_toolpath '+ svg_string);
        res.status(200).send();
    });

    app.get('/machine/generatePreview', (req, res) => {
        let svg_string = req.query['svgString']
        shell.currRpcResponse = res;
        shell.currRpcName = 'generatePreview';
        shell.send('generate_preview '+ svg_string);
    });

    app.get('/machine/generateInstructions', (req, res) => {
        let svg_string = req.query['svgString']
        shell.currRpcResponse = res;
        shell.currRpcName = 'generateInstructions';
        shell.send('generate_instructions '+ svg_string);
    });

    app.get('/camera/takePhoto', (req, res) => {
        /* Format: 'c0,c1,...,c8' */
        let coeffs = req.query['coeffs'] || IDENTITY_COEFFS;
        shell.currRpcResponse = res;
        shell.currRpcName = 'takePhoto';
        shell.send(`take_photo ${coeffs}`);
    });

    app.get('/camera/warpLastPhoto', (req, res) => {
        /* Format: 'c0,c1,...,c8' */
        let coeffs = req.query['coeffs']
        shell.currRpcResponse = res;
        shell.currRpcName = 'warpLastPhoto';
        shell.send(`warp_last_photo ${coeffs}`);
    });

    // TODO: pass in photo as parameter
    app.get('/image/detectFaceBoxes', (req, res) => {
        shell.currRpcResponse = res;
        shell.currRpcName = 'detectFaceBoxes';
        shell.send('detect_face_boxes');
    });

    app.get('/geometries', (req, res) => {
        let names = fs.readdirSync('./geometries').map((file) => {
            return file;
        });
        res.status(200).json({ names: names });
    });

    app.get('/geometry/:name', (req, res) => {
        res.sendFile(__dirname + `/geometries/${req.params.name}`);
    });

    app.listen(port, () => {
        console.log("Running on port: " + port);
        exports = module.exports = app;
    });
}

function seedDatabase(db) {
    const workflowHeadersDir = 'workflows/headers/';
    const workflowImplementationDir = 'workflows/implementations/';
    fs.readdir(workflowHeadersDir, (err, files) => {
        if (err) {
            throw err;
        }
        files.forEach((filename) => {
            if (filename[0] === '.') {
                return;
            }
            if (filename.split('.')[1] === 'json') {
                let fullFilename = workflowHeadersDir + filename;
                let jsFilename = filename.split('.')[0] + '.js';
                let jsFullFileName = workflowImplementationDir + jsFilename;
                fs.readFile(fullFilename, (err, headerData) => {
                    if (err) {
                        throw err;
                    }
                    let headerObj = JSON.parse(headerData);
                    fs.readFile(jsFullFileName, (err, jsData) => {
                        if (err) {
                            console.error(`Missing JS for: ${filename}.`);
                            throw err;
                        }
                        let progName = headerObj['progName'];
                        let progText = jsData.toString();
                        // SQL escapes quotes with ... another quote.
                        progText = progText.replaceAll('\'', '\'\'');
                        let queryStr = ('INSERT INTO Workflows '
                            + '(progName, progText) '
                            + `VALUES ('${progName}', '${progText}');`);
                        let query = db.prepare(queryStr);
                        query.run();
                    });
                });
            }
        });
    });
};

attachRoutesAndStart();

