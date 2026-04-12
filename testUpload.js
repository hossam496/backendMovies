import fs from 'fs';
import FormData from 'form-data';
import fetch from 'node-fetch';

const form = new FormData();
form.append('type', 'latestTrailers');
form.append('movieName', 'test');
form.append('categories', JSON.stringify(['Action']));
form.append('poster', fs.createReadStream('./test.jpg'));

fetch('http://localhost:5000/api/movies', {
  method: 'POST',
  body: form
}).then(r => r.json()).then(console.log).catch(console.log);
