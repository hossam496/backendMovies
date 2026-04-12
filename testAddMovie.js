import fs from 'fs';
import FormData from 'form-data';
import fetch from 'node-fetch';

const data = new FormData();
data.append('type', 'latestTrailers');
data.append('movieName', 'maalik');
data.append('categories', JSON.stringify(['Action']));
data.append('trailerUrl', 'https://youtu.be/0itY1Fhvnnk?si=');
data.append('rating', '7.5');
data.append('duration', '120');
data.append('story', '');
data.append('seatPrices', JSON.stringify({ standard: 150, recliner: 250 }));
data.append('auditorium', 'Audi 1');
data.append('cast', JSON.stringify([]));
data.append('directors', JSON.stringify([]));
data.append('producers', JSON.stringify([]));
data.append('slots', JSON.stringify([]));

// Instead of dummy file, use a real placeholder downloaded from placehold.co
fetch('https://placehold.co/100x100.png')
  .then(r => r.arrayBuffer())
  .then(b => {
    fs.writeFileSync('test-real.png', Buffer.from(b));
    data.append('poster', fs.createReadStream('test-real.png'));
    
    return fetch('http://localhost:5000/api/movies', {
      method: 'POST',
      body: data
    });
  })
  .then(r => r.json())
  .then(console.log)
  .catch(console.log);
