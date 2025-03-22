require('dotenv').config()
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const formidable = require('formidable')
const { MongoClient } = require('mongodb');
const bson = require('bson');
const { v4 : uuidv4 } = require('uuid');

const app = express();




const corsOptions = {
	'origin' : process.env.ORIGIN,
	credentials : true
};


app.use(cors(corsOptions));
app.use(cookieParser(process.env.SECRET));
app.use(express.json())




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




app.post('/create_db' , (req , res) => {

	const form = new formidable.IncomingForm();

	form.parse(req , (error , fields ,files) => {

		if(error){

			res.set('Content-Type' , 'text/plain');
			res.status(500).end('Cannot parse data');
		}

		else{

			const { database , collection } = fields;


			req.conn.db(database[0]).createCollection(collection[0])
			.then(response => {

				res.set('Content-Type' , 'text/plain');
				res.status(200).end('Database Created');

			})
			.catch(error => {
				console.log(error);

				res.set('Content-Type' , 'text/plain');
				res.status(500).end('Could not create database');
			});
		}
	})
});




app.post('/create_coll' , (req ,res) => {

	const form = new formidable.IncomingForm();

	form.parse(req , (error , fields , files) => {

		if(error){

			res.set('Content-Type' , 'text/plain');
			res.status(500).end('Could not parse data');
		}
		else{

			const { database , collection } = fields;

			req.conn.db(database[0]).createCollection(collection[0])
			.then(response => {

				res.set('Content-Type' , 'text/plain');
				res.status(200).end('Collection Created');

			})
			.catch(error => {
				console.log(error);

				res.set('Content-Type' , 'text/plain');
				res.status(500).end('Could not create collection');
			});
		}
	})
});


app.delete('/drop_db/:db' , (req , res) => {

	const db = req.params?.db;

	if(db === undefined){

		res.set('Content-Type' , 'text/plain');
		res.status(400).end('Please provide the database');
	}
	else{

		req.conn.db(db).dropDatabase()
		.then(response => {

			res.set('Content-Type' , 'text/plain');
			res.status(200).end('Database deleted Successfully');
		})
		.catch(error => {

			console.log(error);
			res.set('Content-Type' , 'text/plain');
			res.status(500).end(`Could not delete database ${db}`);
		});
	}
});


app.delete('/drop_col/:db/:col' , (req , res) => {

	const db = req.params?.db;
	const col = req.params?.col;


	if(db === undefined){

		res.set('Content-Type' , 'text/plain');
		res.status(400).end('Please provide the database');
	}
	else if(col === undefined){

		res.set('Content-Type' , 'text/plain');
		res.status(400).end('Please provide the collection');
	}
	else{

		req.conn.db(db).collection(col).drop()
		.then(response => {

			res.set('Content-Type' , 'text/plain');
			res.status(200).end('Collection deleted Successfully');
		})
		.catch(error => {

			console.log(error);
			res.set('Content-Type' , 'text/plain');
			res.status(500).end(`Could not delete collection ${col}`);
		});
	}
});


app.post('/insert_doc' , (req ,res) => {


	const { db : database , col : collection , data } = req.body;


	if(database === undefined){

		res.set('Content-Type' , 'text/plain');
		res.status(400).end('Please select a database');
	}
	else if(collection === undefined){

		res.set('Content-Type' , 'text/plain');
		res.status(400).end('Please select collection');
	}
	else if(data === undefined){

		res.set('Content-Type' ,'text/plain');
		res.status(400).end('Data not present');
	}
	else if(!Array.isArray(data)){

		res.set('Content-Type' ,'text/plain');
		res.status(400).end('Data is not of valid format');
	}
	else if(data.length === 0){

		res.set('Content-Type' , 'text/plain');
		res.status(400).end('Please provide the data');
	}
	else{

		req.conn.db(database).collection(collection).insertMany(data)
		.then(response => {
			
			if(response.acknowledged){

				if(response.insertedCount === data.length){

					let responseIds = [];

					Object.keys(response.insertedIds).map(key => responseIds.push(response.insertedIds[key]));


					res.set('Content-Type' , 'application/json');
					res.end(JSON.stringify(responseIds));
				}
			}

		})
		.catch(error => {
			console.log(error)

			res.set('Content-Type' , 'text/plain');
			res.status(500).end('Internal Server Error');
		});
	}
});



app.delete('/delete_doc/:db/:col/:id' , (req ,res) => {

	const db = req.params?.db;
	const col = req.params?.col;
	const id = req.params?.id;



	if(db === undefined){

		res.set('Content-Type' , 'text/plain');
		res.status(400).end('Please select a database');
	}
	else if(col === undefined){

		res.set('Content-Type' , 'text/plain');
		res.status(400).end('Please select a collection');
	}
	else if(id === undefined){

		res.set('Content-Type' , 'text/plain');
		res.status(400).end('Please select a document');
	}
	else{


		req.conn.db(db).collection(col).deleteOne({'_id' : new bson.ObjectId(id)})
		.then(response => {

			
			if(response.acknowledged){

				if(response.deletedCount === 1){

					res.set('Content-Type' , 'text/plain');
					res.status(200).end('Deleted Successfully');
				}
				else{

					res.set('Content-Type' , 'text/plain');
					res.status(500).end('Could not delete document');
				}
			}
			else{

				res.set('Content-Type' , 'text/plain');
				res.status(500).end('Could not delete document');
			}

		})
		.catch(error => {

			console.log(error);

			res.status(500).end('Could not delete document');
		});
	}
})


app.delete('/delete_field/:db/:col/:id/:key' , (req ,res) => {

	const db = req.params?.db;
	const col = req.params?.col;
	const id = req.params?.id;
	const key = req.params?.key;



	if(db === undefined){

		res.set('Content-Type' , 'text/plain');
		res.status(400).end('Please select a database');
	}
	else if(col === undefined){

		res.set('Content-Type' , 'text/plain');
		res.status(400).end('Please select a collection');
	}
	else if(id === undefined){

		res.set('Content-Type' , 'text/plain');
		res.status(400).end('Please select a document');
	}
	else if(key === undefined){

		res.set('Content-Type' , 'text/plain');
		res.status(400).end('Please select a field');
	}
	else{


		req.conn.db(db).collection(col).updateOne({'_id' : new bson.ObjectId(id)} , {$unset : {[key] : ''}})
		.then(response => {

			if(response.acknowledged){

				res.set('Content-Type' , 'text/plain');
				res.status(200).end('Deleted Successfully');
			}
			else{

				res.set('Content-Type' , 'text/plain');
				res.status(500).end('Could not delete field');
			}

		})
		.catch(error => {

			console.log(error);

			res.status(500).end('Could not delete field');
		});
	}
})




app.post('/update_doc' , (req ,res) => {



	const { database , collection , updatedDoc } = req.body;


	if(database === undefined){

		res.set('Content-Type' , 'text/plain');
		res.status(400).end('Please select a database');
	}
	else if(collection === undefined){

		res.set('Content-Type' , 'text/plain');
		res.status(400).end('Please select collection');
	}
	else if(updatedDoc === undefined){

		res.set('Content-Type' ,'text/plain');
		res.status(400).end('Data not present');
	}
	else if(typeof(updatedDoc) !== 'object'){

		res.set('Content-Type' ,'text/plain');
		res.status(400).end('Data is not of valid format');
	}
	else{


		const selectionQuery = { '_id' : new bson.ObjectId(updatedDoc['_id'])};

		delete updatedDoc['_id'];


		req.conn.db(database).collection(collection).replaceOne(selectionQuery , updatedDoc)
		.then(response => {


			if(response.acknowledged){

				res.set('Content-Type' , 'text/plain');
				res.status(200).end('Document Updated Successfully');
			}
			else{

				res.set('Content-Type' , 'text/plain');
				res.status(500).end('Failed to update document');
			}
		})
		.catch(error => {

			console.log(error);

			res.set('Content-Type' , 'text/plain');
			res.status(500).end('Internal Server Error');
		});

	}

});




app.post('/filter_docs' , (req , res) => {


	const form = new formidable.IncomingForm()

	form.parse(req , (error , fields ,files) => {
		
		if(error){

			res.set('Content-Type' , 'text/plain');
			res.status(500).end('Cannot parse provided data');
		}

		const { database , collection , query } = fields;


		if(database === undefined){

			res.set('Content-Type' , 'text/plain');
			res.status(400).end('Please select database');
		}
		else if(collection === undefined){

			res.set('Content-Type' , 'text/plain');
			res.status(400).end('Please select collection');
		}
		else if(query === undefined){

			res.set('Content-Type' , 'text/plain');
			res.status(400).end('Please provide query');
		}
		else{

			try{

				const findQuery = JSON.parse(query[0]);


				req.conn.db(database[0]).collection(collection[0]).find(findQuery).toArray()
				.then(response => {

					res.set('Content-Type' , 'application/json');

					res.status(200).end(JSON.stringify(response));
				})
				.catch(error => {

					console.log(error);

					res.set('Content-Type' ,'text/plain');
					res.status(500).end('Cannot query documents');
				})
			}
			catch(error){

				console.log(error);

				res.set('Content-Type' , 'text/plain');

				res.status(500).end('Provided query is not of valid format');
			}
		}
	});
});



app.listen(process.env.PORT , process.env.HOST , () => {
	console.log(`Server is listening at port ${process.env.PORT}`);
});