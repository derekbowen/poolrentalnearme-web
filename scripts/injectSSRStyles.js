const fs = require('fs');

// Read the file
fs.readFile('./dist/client/index.html', 'utf8', function (err, data) {
  if (err) throw err;

  // Find the position of </head> in the HTML data
  let headClosePosition = data.indexOf('</head>');

  // Insert the comment before </head>
  let modifiedHtml =
    data.slice(0, headClosePosition) + '  <!--!ssrStyles-->\n' + data.slice(headClosePosition);

  // Write the modified HTML back to the file
  fs.writeFile('./dist/client/index.html', modifiedHtml, 'utf8', function (err) {
    if (err) throw err;
    console.log('Successfully inserted <!--!ssrStyles--> at the end of head');
  });
});
