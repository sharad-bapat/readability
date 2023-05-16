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
        if (!url) {
            return res.status(400).json({ error: 'Missing URL parameter' });
        }

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
        // article.sentiment = analyzer.getSentiment(removeHTMLTags(article.textContent).split("."))
        res.json(article);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error fetching and parsing the URL' });
    }
});

// Start the server
const port = process.env.PORT || 3030;
// const port = 3000; // Change to your desired port number
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


