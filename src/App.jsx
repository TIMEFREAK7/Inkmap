import { useEffect, useState } from 'react';
import Globe from './Globe.jsx';
import FpsMeter from './FpsMeter.jsx';
import Spikes from './Spikes.jsx';
import { loadCountries, loadPlaces } from './data.js';

// Tier 0 feasibility screen: globe with every country filled, fps meter, and place-data load time.
export default function App() {
  const [countries, setCountries] = useState(null);
  const [places, setPlaces] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadCountries().then(setCountries, setError);
    loadPlaces().then(setPlaces, setError);
  }, []);

  return (
    <main>
      {countries && <Globe geo={countries.geo} />}
      <div className="panel">
        <h1>Inkmap</h1>
        <FpsMeter />
        <p>{countries ? `${countries.list.length} countries` : 'Loading countries…'}</p>
        <p>{places ? `${places.count.toLocaleString()} places loaded in ${places.ms} ms (background)` : 'Loading places…'}</p>
        <Spikes />
        {error && <p role="alert">Could not load data: {String(error)}</p>}
      </div>
    </main>
  );
}
