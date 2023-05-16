const jsdom = require('jsdom');
const { Readability } = require('@mozilla/readability');
// const fetch = require('node-fetch');

module.exports = async (req, res) => {
  const url = req.query.url;
  console.log("article")
  // Fetch the HTML content
  const response = await fetch(url);
  const html = await response.text();

  // Use JSDOM to parse the HTML
  const dom = new jsdom.JSDOM(html, { url });

  // Use Mozilla Readability to extract the main content
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  console.log(article)
  // Return the main content as the response
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin','*') 
  res.status(200).send(article);
};
