const mongoose = require("mongoose");
const db = mongoose.connection;

const mongoURL = `mongodb://${process.env.MONGO_USERNAME}:${process.env.MONGO_PASSWORD}@${process.env.MONGO_HOST}:${process.env.MONGO_PORT}`;

mongoose.connect(mongoURL, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  useFindAndModify: false,
});

db.on("error", console.error.bind(console, "connection error:"));

db.once("open", function () {
  console.log(`connected to mongodb`);
});

module.exports = {
  Blog: require("./schemas/Blog.js"),
  db: db,
};
