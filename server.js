require('dotenv').config()
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const formidable = require('formidable')
const { MongoClient } = require('mongodb');
const { v4 : uuidv4 } = require('uuid');

const app = express();




const corsOptions = {
	'origin' : process.env.ORIGIN,
	credentials : true
};


app.use(cors(corsOptions));
app.use(cookieParser(process.env.SECRET));





const dbConnections = []; // HOLDS THE DATBASE CONNECTIONS FOR EACH INSTANCE



const getConn = sessionid => {

	let conn = null;

	dbConnections.every(row=>{

		if(Object.keys(row)[0] === sessionid){

			conn = row[sessionid];
			return false;
		}
		else{
			return true;
		}
	});

	return conn;
}




const cookieMiddleware = (req , res ,next) => {


	// MIDDLEWARE TO EXTRACT COOKIES FOR EVERY API EXCEPT THE /connect

	if(req.path !== '/connect'){


		if(req.signedCookies.sessionid !== undefined){

			const conn = getConn(req.signedCookies.sessionid);

			if(conn === null){

				res.set('Content-Type' , 'text/plain');
				res.status(400).end('Session not found');
			}
			else{

				req.conn = conn;
				next();
			}
		}
		else{

			res.set('Content-Type' , 'text/plain');
			res.status(401).end('Please refresh the page and try again');
		}
	}
	else{
		next();
	}
}




app.use(cookieMiddleware)






const connectToDb = (host , port) => {


	const uri = `mongodb://${host}:${port}`;

	const client = new MongoClient(uri);

	return client.connect()

}







app.post('/connect' , (req , res) => {
	

	const form = new formidable.IncomingForm();

	form.parse(req , (err , fields ,files) => {

		if(err){

			res.set('Content-Type' , 'text/plain')
			res.status(400).end('Cannot parse data');
		}


		const { host , port } = fields;

		connectToDb(host , port)
		.then(response => {

			const id = uuidv4();


			dbConnections.push({[id] : response});

			res.cookie('sessionid' , id , {secure : true  , signed : true })

			res.set('Content-Type' , 'text/plain');
			res.status(200).end(id);
		})
		.catch(error => {
			
			console.log(error);

			res.set('Content-Type' , 'text/plain');
			res.status(500).end('Could not connect to server');
		});

	});

});





app.get('/show_dbs' , (req , res) => {


	const admin = req.conn.db().admin();

	admin.listDatabases()
	.then(response => {


		const parsedData = response.databases.map(row => row.name);


		res.status(200).json(parsedData);
	})
	.catch(error => {

		console.log(error);

		res.status(500).end("Could not fetch list");
	});

});




app.get('/show_cols/:db' , (req , res) => {


	const db = req.params?.db

	if(db === undefined){

		res.set('Content-Type' , 'text/plain');

		res.status(400).end('Please select a database');
	}
	else{
		
		const dbInstance = req.conn.db(db)

		dbInstance.listCollections().toArray()
		.then(response => {
			
			const collectionsList = response.map(row => row.name)

			res.json(collectionsList);
		})
		.catch(error => {
			console.log(error);

			res.set('Content-Type' , 'text/plain');
			res.status(500).end('Internal Server Error');
		});

	}
});



app.get('/fetch_data/:db/:col' , (req , res) => {

	const db = req.params?.db
	const coll = req.params?.col;

	if(db === undefined){

		res.set('Content-Type' , 'text/plain')
		res.status(400).end('Please select a database');
	}
	else if(coll === undefined){

		res.set('Content-Type' , 'text/plain')
		res.status(400).end('Please provide collection');
	}
	else{

		const dbInstance = req.conn.db(db);

		const col = dbInstance.collection(coll);
	

		col.find().toArray()
		.then(response => {

			res.json(response);
		})
		.catch(error => {

			console.log(error);

			res.status(500).end('Internal Server Error');
		});
	}
})



app.listen(process.env.PORT , process.env.HOST , () => {
	console.log(`Server is listening at port ${process.env.PORT}`);
});