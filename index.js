const express = require('express');
const app = express();
const cors = require('cors');
const port = process.env.PORT || 3000;
require('dotenv').config();
const stripe = require("stripe")(process.env.PAYMENT_SECRET_KEY);
const { MongoClient, ServerApiVersion, ObjectId, Admin } = require('mongodb');
const jwt = require('jsonwebtoken');

//middleware
app.use(cors())
app.use(express.json());



const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if(!authorization){
    return res.status(401).send({error: true, message: 'unauthorized access'})
  }
  // bearer token
  const token = authorization.split(' ')[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if(err){
      return res.status(401).send({error: true, message: 'unauthorized access'})
    }
    req.decoded = decoded;
    next();
  })
}


console.log(process.env.DB_PASS);
console.log(process.env.DB_USER);

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.hk4z3.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;


// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
     client.connect();
     
     const usersCollection = client.db("bdRestaurant").collection("users");
     const menuCollection = client.db("bdRestaurant").collection("menu");
     const reviewCollection = client.db("bdRestaurant").collection("reviews");
     const cartCollection = client.db("bdRestaurant").collection("carts");
     const paymentCollection = client.db("bdRestaurant").collection("payments");
     

     app.post('/jwt', (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn:'5h' })
        res.send({token})
     })
    
    //  Warning: use verifyJWT before using verifyAdmin
     const verifyAdmin = async(req, res, next) => {
      const email = req.decoded.email;
      const query = {email: email}
      const user = await usersCollection.findOne(query);
      if(user?. role !== "admin") {
        return res.status(403).send({error: true, message: ' forbidden access'})
      }
      next();

    }

  /**
   * don't show secure links to those who should not see the link
   * 1.use jwt token: verifyJWT
   * use verify admin
   */

    //  users related api
    app.get('/users',verifyJWT, verifyAdmin, async(req, res) =>{
      const result = await usersCollection.find().toArray();
      res.send(result);
     })

    app.post('/users', async(req, res) =>{
      const user = req.body;
      const query = {email: user.email}
      const existingUser = await usersCollection.findOne(query);
      console.log("existing user",existingUser);
      if(existingUser) {
        return res.send({message: 'user already exists'})
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);
    })
  // security layer:verifyJWT 1st step
  // email same  2nd step
  // check admin  3rd step




    app.get('/users/admin/:email', verifyJWT, async (req, res) => {
      const email = req.params.email;
    
      if(req.decoded.email !== email){
        res.send({admin:false})
      }
  
      const query = { email:email }
      const user = await usersCollection.findOne(query);
      const result = { admin: user?.role === 'admin' }
      res.send(result);
    })


    app.patch('/users/admin/:id', async(req, res) =>{
      const id = req.params.id;
      const filter = {_id: new ObjectId(id) };
      const updateDoc = {
        $set:{
          role:'admin'
        },
      };

      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result);

    })

    //  menu related api
     app.get('/menu', async(req, res) =>{
      const result = await menuCollection.find().toArray();
      res.send(result);
     })
     app.post('/menu',verifyJWT, verifyAdmin, async(req, res) =>{
      const newItem = req.body;
      const result = await menuCollection.insertOne(newItem)
      res.send(result);
     })

     app.delete('/menu/:id', verifyJWT,verifyAdmin, async(req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id)};
      const result = await menuCollection.deleteOne(query);
      res.send(result);
     })

     //review related api
     app.get('/reviews', async(req, res) =>{
      const result = await reviewCollection.find().toArray();
      res.send(result);
     })
    //  cart collection apis

    app.get('/carts',verifyJWT, async(req, res) =>{
      const email = req.query.email;
      if(!email){
        res.send([]);
      }
      
      const decodedEmail = req.decoded.email;
      if(email !== decodedEmail){
        return res.status(403).send({error: true, message: 'forbidden access'})
      }

      const query = {email:email};
      const result = await cartCollection.find(query).toArray();
      res.send(result);
    })

     app.post('/carts', async(req, res)=>{
      const item = req.body;
      console.log(item);
      const result = await cartCollection.insertOne(item);
      res.send(result);

     })

     app.delete('/carts/:id', async(req,res)=>{
      const id = req.params.id;
      const query = { _id: new ObjectId(id)};
      const result = await cartCollection.deleteOne(query);
      res.send(result);
     })

    //  create payment intent

    // app.post('/create-payment-intent',verifyJWT,  async(req, res) =>{
    //   const {price} = req.body;
    //   const amount = Math.round(price * 100);
    //   console.log(price,amount);
    //   const paymentIntent = await stripe.paymentIntents.create({
    //     amount: amount,
    //     currency: 'usd',
    //     payment_method_types: ['card']
    //   });
    //   res.send({
    //     clientSecret: paymentIntent.client_secret
    //   })
    // })

    app.post('/create-payment-intent', verifyJWT, async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
    
      // Log for debugging
      console.log('Received price:', price);
      console.log('Converted amount in cents:', amount);
    
      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount,
          currency: 'usd',
          payment_method_types: ['card'],
        });
    
        res.send({
          clientSecret: paymentIntent.client_secret,
        });
      } catch (error) {
        console.error('Error creating payment intent:', error);
        res.status(500).send({ error: error.message });
      }
    });

  //  payment related api

  app.post('/payments',verifyJWT, async(req, res) => {
    const payment = req.body;
    const insertResult = await paymentCollection.insertOne(payment);
    const query = {_id: { $in: payment.cartItems.map(id => new ObjectId(id))}}
   const deleteResult = await cartCollection.deleteMany(query)
    res.send({insertResult, deleteResult});
  })

  app.get('/admin-stats',verifyJWT,verifyAdmin, async(req, res) =>{
    const users = await usersCollection.estimatedDocumentCount();
    const products = await menuCollection.estimatedDocumentCount();
    const orders = await paymentCollection.estimatedDocumentCount();
    const payments = await paymentCollection.find().toArray();
    const revenue = payments.reduce((sum, payment) => sum + payment.price, 0)
    res.send({
      users, 
      products,
      orders,
      revenue,
    })
    })
 
  app.get('/orders-stats',verifyJWT,verifyAdmin, async(req, res) =>{

  
  const pipeline = [
    {
      $lookup: {
        from: 'menu',
        localField: 'menuItems',
        foreignField: '_id',
        as: 'menuItemsInfo'
      }
    },
    {
      $unwind: '$menuItemsInfo'
    },
    {
      $group: {
        _id: '$menuItemsInfo.category',
        count: { $sum: 1 },
        total: { $sum: '$menuItemsInfo.price' }
      }
    },
    {
      $project: {
        category: '$_id',
        count: 1,
        total: { $round: ['$total', 2] }
      }
    },
    {
      $project: {
        _id: 0,
        category: 1,
        count: 1,
        total: 1
      }
    }
  ];
  

  const result = await paymentCollection.aggregate(pipeline).toArray()
    res.send(result)
})

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('Boss is sitting')
})

app.listen(port, () => {
  console.log(`bd restaurant is running on port ${port}`);
})