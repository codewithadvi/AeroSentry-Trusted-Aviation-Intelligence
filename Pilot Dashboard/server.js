import express from "express";
import axios from "axios";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());

const PORT = process.env.PORT || 5000;

// Simple cache
const cache = {};
const CACHE_TTL = 60 * 1000;

async function getWithCache(url) {
  if (cache[url] && Date.now() - cache[url].timestamp < CACHE_TTL) {
    return cache[url].data;
  }
  const res = await axios.get(url);
  cache[url] = { data: res.data, timestamp: Date.now() };
  return res.data;
}

app.get("/api/weather/:departure/:destination", async (req, res) => {
  const { departure, destination } = req.params;
  const icaoRegex = /^[A-Z]{4}$/;

  if (!icaoRegex.test(departure) || !icaoRegex.test(destination)) {
    return res.status(400).json({ error: "Invalid ICAO code format" });
  }

  try {
    const depMetarUrl = `https://aviationweather.gov/api/data/metar?ids=${departure}&format=json`;
    const destMetarUrl = `https://aviationweather.gov/api/data/metar?ids=${destination}&format=json`;
    const depTafUrl = `https://aviationweather.gov/api/data/taf?ids=${departure}&format=json`;
    const destTafUrl = `https://aviationweather.gov/api/data/taf?ids=${destination}&format=json`;

    const [depMetar, destMetar, depTaf, destTaf] = await Promise.all([
      getWithCache(depMetarUrl),
      getWithCache(destMetarUrl),
      getWithCache(depTafUrl),
      getWithCache(destTafUrl),
    ]);

    res.json({
      departureMetar: depMetar.find((m) => m.icaoId === departure) || null,
      destinationMetar: destMetar.find((m) => m.icaoId === destination) || null,
      departureTaf: depTaf.find((t) => t.icaoId === departure) || null,
      destinationTaf: destTaf.find((t) => t.icaoId === destination) || null,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Failed to fetch data" });
  }
});

app.listen(PORT, () =>
  console.log(`✅ AeroSentry backend running at http://localhost:${PORT}`)
);
