const express = require('express');
const fetch = require('node-fetch');
const { Readability } = require('@mozilla/readability');
const { JSDOM } = require('jsdom');
const natural = require('natural');
var Sentiment = require('sentiment');
var sentiment = new Sentiment();
var nlp = require("compromise")


const app = express();

app.get('/parse', async (req, res) => {
    try {
        const url = req.query.url;
        var format = req.query.format
        if (!url) {
            return res.status(400).json({ error: 'Missing URL parameter' });
        }
        format = format && format.toLowerCase() === 'json' ? 'json' : 'html';


        const response = await fetch(url);
        if (!response.ok) {
            throw new Error('HTTP request failed: ' + response.status);
        }
        const html = await response.text();
        const dom = new JSDOM(html);
        const reader = new Readability(dom.window.document, url);
        const article = reader.parse();
        article.summary = generateSummary(removeHTMLTags(article.textContent), 120, 3);
        article.sentiment = sentiment.analyze(removeHTMLTags(article.textContent));
        let doc = nlp(removeHTMLTags(article.textContent))
        if (doc.topics()) {
            var topics = [];
            doc.topics().unique().map(function (item, index) {
                topics.push(item.text())
            });
            article.topics = topics;
        }
        

        const htmlContent = `
        <html>
        <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
            /* Inline CSS for the article reader */
            body {
                background-color:#f8f9fa;
                color: #000;
                font-family: Helvetica, Arial, sans-serif;
                line-height: 1.6;
                margin: 0;
                padding: 90px;
                max-width: 35vw;
                margin: 0 auto; /* Center align the content */
            }

            .domain {
                font-size: 1em;
                line-height: 1.48em;
                padding-bottom: 4px;
                font-family: Helvetica, Arial, sans-serif;
                text-decoration: underline var(--main-foreground) !important;
                // color: var(--link-foreground);
                color: #0d6efd;
              }
            
            h1 {
                // font-size: 24px;
                font-weight: bold;
                // margin-bottom: 10px;
                color: #000;
                font-size: 2em;
                line-height: 1.25em;
                width: 100%;
                margin: 30px 0;
                padding: 0;
            }
            
            p {
                margin: 30px 0;
                color: #000;                
                font-size: 1.2em;
            }

            img{
                max-width: 35vw;
                height:auto;
                object-fit:contain;
                margin: 0 auto !important;
            }    
           
            figure img{
                max-width: 35vw;
                height:auto;
                object-fit:contain;
                margin: 0 auto !important;
            }  

            @media (max-width: 768px) {
                /* Styles for small screens */
                body {
                    max-width: 90vw;
                    padding: 40px;
                }
                img{
                    max-width: 85vw;
                    height:auto;
                    object-fit:contain;
                     margin: 0 auto !important;
                }
                figure img{
                max-width: 85vw;
                height:auto;
                object-fit:contain;
                margin: 0 auto !important;
            }  
              }
            </style>
        </head>
        <body>
            <a href="${url}" class="domain">${new URL(url).hostname}</a>
            <h1>${article.title}</h1>
            <p>${article.siteName}</p>
            <hr style="margin-top:25px;margin-bottom:25px; color: #fff" />
            <p>${article.content}</p>
        </body>
        </html>
    `;

        if (format == "json") {                     
            res.json(article);
        }else{
            res.setHeader('Content-Type', 'text/html');
            res.send(htmlContent);
        }
        

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error fetching and parsing the URL' });
    }
});

// Start the server
const port = 3000; // Change to your desired port number
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

function removeHTMLTags(content) {
    return content.replace(/<[^>]+>/g, '');
}

function generateSummary(content, maxLength, numberOfSentences) {
    // Tokenize the content
    const tokenizer = new natural.SentenceTokenizer();
    const sentences = tokenizer.tokenize(content);

    // Create a matrix to represent sentence relationships
    const matrix = Array.from({ length: sentences.length }, () => Array(sentences.length).fill(0));

    // Calculate sentence similarities
    for (let i = 0; i < sentences.length; i++) {
        const sentenceA = sentences[i];
        const wordsA = sentenceA.split(' ');
        for (let j = 0; j < sentences.length; j++) {
            if (i === j) continue;
            const sentenceB = sentences[j];
            const wordsB = sentenceB.split(' ');
            const similarity = calculateSimilarity(wordsA, wordsB);
            matrix[i][j] = similarity;
        }
    }

    // Apply PageRank algorithm
    const pageRank = Array(sentences.length).fill(1); // Initialize PageRank values
    const dampingFactor = 0.85; // Damping factor (usually set to 0.85)
    const iterations = 10; // Number of iterations (adjust as needed)

    for (let iter = 0; iter < iterations; iter++) {
        const newPageRank = Array(sentences.length).fill(0);
        for (let i = 0; i < sentences.length; i++) {
            for (let j = 0; j < sentences.length; j++) {
                if (i === j) continue;
                newPageRank[i] += (1 - dampingFactor) * (matrix[j][i] / sumColumn(matrix, j)) * pageRank[j];
            }
        }
        pageRank.splice(0, pageRank.length, ...newPageRank);
    }

    // Sort sentences by their PageRank values
    const rankedSentences = sentences.map((sentence, index) => ({ sentence, rank: pageRank[index] }));
    rankedSentences.sort((a, b) => b.rank - a.rank);

    // Select top sentences and generate the summary
    let summary = '';
    for (let i = 0; i < numberOfSentences; i++) {
        summary += rankedSentences[i].sentence + ' ';
    }

    // Truncate the summary to the specified maxLength
    if (summary.length > maxLength) {
        summary = summary.substr(0, maxLength) + '...';
    }

    return summary;
}

// Calculate cosine similarity between two arrays of words
function calculateSimilarity(wordsA, wordsB) {
    const intersection = new Set(wordsA.filter((word) => wordsB.includes(word)));
    const union = new Set([...wordsA, ...wordsB]);
    return intersection.size / union.size;
}

// Calculate the sum of a column in a matrix
function sumColumn(matrix, columnIndex) {
    let sum = 0;
    for (let i = 0; i < matrix.length; i++) {
        sum += matrix[i][columnIndex];
    }
    return sum;
}


