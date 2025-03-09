const express = require('express');
const cors = require('cors');
const formidable = require('formidable')
const { MongoClient } = require('mongodb');
const { v4 : uuidv4 } = require('uuid');

const app = express();
const port = 8000;
const host = '127.0.0.1';




const corsOptions = {
	'origin' : 'http://127.0.0.1:3000',
	credentials : true
};


app.use(cors(corsOptions));






const dbConnections = []; // HOLDS THE DATBASE CONNECTIONS FOR EACH INSTANCE







const connectToDb = (host , port) => {


	const uri = `mongodb://${host}:${port}`;

	const client = new MongoClient(uri);

	return client.connect()

}







app.post('/connect' , (req , res) => {
	
	if(req.method === 'POST'){

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


				dbConnections.push({id : response});

				res.set('Content-Type' , 'text/plain');
				res.status(200).end(id);
			})
			.catch(error => {
				
				res.set('Content-Type' , 'text/plain');
				res.status(500).end('Could not connect to server');
			});

		});

	}
	else{

		res.set('Content-Type' , 'text/plain');
		res.status(405).end('Method not allowed');
	}

});

app.listen(port , host , () => {
	console.log(`Server is listening at port ${port}`);
});