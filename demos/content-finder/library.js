// The folders the demo can drop in. Each image lists the tags "ChatGPT" assigns during the scan;
// they show only in the image viewer, where visitors can add their own.
// Put the real files in images/<folder>/ with these names; until then each tile draws a colored placeholder.
// hue only colors the placeholder.
window.FINDER_FOLDERS = {
  ocean: {
    name: 'Ocean Futures',
    dir: 'images/ocean-futures/',
    color: '#2f7fb5',
    suggest: ['bermuda', 'coral reef', 'penguin', 'carnivore'],
    items: [
      { file: 'sonoran-desert.webm', poster: 'sonoran-desert.jpg', video: true, length: '0:05', title: 'Clouds over the Sonoran desert', hue: 30, tags: ['video', 'clip', 'timelapse', 'desert', 'sonoran desert', 'arizona', 'american', 'usa', 'cactus', 'saguaro', 'rock formations', 'mountains', 'clouds', 'sky', 'dusk', 'nature', 'plant'] },
      { file: 'african-penguins.jpg', title: 'African penguins', hue: 210, tags: ['penguin', 'african penguin', 'bird', 'seabird', 'animal', 'carnivore', 'flightless', 'black and white', 'endangered', 'zoo', 'aquarium', 'group', 'marine life'] },
      { file: 'sea-lion.jpg', title: 'Sea lion with its tongue out', hue: 28, tags: ['sea lion', 'animal', 'mammal', 'marine mammal', 'carnivore', 'pinniped', 'whiskers', 'tongue', 'funny', 'cute', 'zoo', 'aquarium', 'pool', 'sunny', 'wildlife'] },
      { file: 'sea-lion-jump.webm', poster: 'sea-lion-jump.jpg', video: true, length: '0:06', title: 'Sea lion leaping into the pool', hue: 190, tags: ['video', 'clip', 'sea lion', 'jumping', 'leap', 'splash', 'pool', 'water', 'zoo', 'aquarium', 'animal', 'mammal', 'marine mammal', 'carnivore', 'pinniped', 'playful', 'action'] },
      { file: 'coral-reef.jpg', title: 'Queen angelfish on the reef', hue: 200, tags: ['coral reef', 'angelfish', 'queen angelfish', 'fish', 'reef fish', 'brain coral', 'sea fans', 'underwater', 'blue', 'yellow', 'tropical', 'animal', 'marine life', 'bermuda'] },
      { file: 'jellyfish.jpg', title: 'Moon jellyfish', hue: 200, tags: ['jellyfish', 'moon jellyfish', 'invertebrate', 'cnidarian', 'translucent', 'underwater', 'open water', 'blue', 'calm', 'drifting', 'animal', 'marine life'] },
      { file: 'atlantic-explorer.jpg', title: 'R/V Atlantic Explorer', hue: 190, tags: ['bermuda', 'research vessel', 'ship', 'atlantic explorer', 'harbor', 'palm trees', 'turquoise water', 'science', 'vehicle', 'boat'] },
      { file: 'diver-brain-coral.jpg', title: 'Diver over brain coral', hue: 210, tags: ['bermuda', 'diver', 'scuba', 'coral reef', 'brain coral', 'sea fans', 'underwater', 'deep blue', 'science', 'people', 'person'] },
      { file: 'boat-offshore.jpg', title: 'Boat heading offshore', hue: 205, tags: ['bermuda', 'boat', 'wake', 'open ocean', 'aerial', 'drone shot', 'cloudy', 'coastline', 'vehicle'] },
      { file: 'ship-mast-asu.jpg', title: 'Atlantic Explorer mast', hue: 200, tags: ['bermuda', 'research vessel', 'ship', 'asu', 'arizona state university', 'bermuda institute of ocean sciences', 'bios', 'logo', 'satellite dome', 'american flag', 'vehicle'] }
    ]
  },
  travel: {
    name: 'Travel',
    dir: 'images/travel/',
    color: '#d08a1e',
    suggest: ['car', 'animal', 'mountains', 'beach'],
    items: [
      { file: 'venice-gondolas.webm', poster: 'venice-gondolas.jpg', video: true, length: '0:10', title: 'Gondolas in a Venice canal', hue: 30, tags: ['video', 'clip', 'venice', 'italy', 'italian', 'europe', 'gondola', 'gondolier', 'canal', 'boat', 'vehicle', 'people', 'tourists', 'architecture'] },
      { file: 'dingle-waves.webm', poster: 'dingle-waves.jpg', video: true, length: '0:10', title: 'Waves on the Dingle shore', hue: 200, tags: ['video', 'clip', 'waves', 'beach', 'rocks', 'ocean', 'ireland', 'irish', 'europe', 'dingle peninsula', 'coast', 'calm', 'blue sky', 'nature'] },
      { file: 'paris-eiffel.jpg', title: 'Eiffel Tower', hue: 24, tags: ['eiffel tower', 'paris', 'landmark', 'architecture', 'city', 'french', 'france', 'europe', 'tower', 'iron', 'blue sky'] },
      { file: 'tokyo-neon.jpg', title: 'Tokyo street at night', hue: 300, tags: ['tokyo', 'city', 'neon', 'night', 'street', 'japanese', 'japan', 'asia', 'signs', 'nightlife', 'crowd'] },
      { file: 'santorini.jpg', title: 'Santorini rooftops', hue: 206, tags: ['santorini', 'greece', 'white', 'blue', 'sea', 'greek', 'europe', 'island', 'church', 'domes', 'cliffs'] },
      { file: 'machu-picchu.jpg', title: 'Machu Picchu', hue: 120, tags: ['machu picchu', 'mountains', 'ruins', 'landmark', 'green', 'peru', 'peruvian', 'south america', 'inca', 'ancient', 'unesco'] },
      { file: 'venice-canal.jpg', title: 'Venice canal', hue: 36, tags: ['venice', 'canal', 'gondola', 'boat', 'architecture', 'italian', 'italy', 'europe', 'church', 'water', 'vehicle'] },
      { file: 'nyc-skyline.jpg', title: 'New York skyline', hue: 218, tags: ['new york', 'city', 'skyline', 'skyscrapers', 'evening', 'american', 'usa', 'manhattan', 'empire state building', 'sunset'] },
      { file: 'sahara-dunes.jpg', title: 'Desert dunes', hue: 30, tags: ['desert', 'dunes', 'camels', 'sand', 'golden', 'moroccan', 'africa', 'animal', 'mammal', 'herbivore', 'caravan', 'sunset'] },
      { file: 'northern-lights.jpg', title: 'Northern lights', hue: 150, tags: ['northern lights', 'iceland', 'night', 'sky', 'calm', 'aurora', 'icelandic', 'church', 'stars', 'winter'] },
      { file: 'bangkok-market.jpg', title: 'Street food skewers', hue: 8, tags: ['street food', 'market', 'food', 'grill', 'colorful', 'thai', 'thailand', 'asia', 'skewers', 'meat', 'sausage'] },
      { file: 'alps-cabin.jpg', title: 'Alpine huts', hue: 210, tags: ['mountains', 'alps', 'cabin', 'snow', 'hiking', 'swiss', 'switzerland', 'europe', 'glacier', 'hut', 'building'] },
      { file: 'grand-canyon.jpg', title: 'Grand Canyon', hue: 18, tags: ['grand canyon', 'desert', 'cliffs', 'landmark', 'nature', 'american', 'usa', 'arizona', 'canyon', 'sunset', 'national park'] },
      { file: 'bali-terraces.jpg', title: 'Bali rice terraces', hue: 100, tags: ['rice terraces', 'bali', 'green', 'nature', 'tropical', 'indonesian', 'indonesia', 'asia', 'farm', 'palm trees', 'agriculture'] },
      { file: 'london-bus.jpg', title: 'Routemaster on Oxford Street', hue: 356, tags: ['london', 'bus', 'night', 'city', 'street', 'british', 'england', 'uk', 'europe', 'double decker', 'vehicle', 'red', 'christmas lights'] },
      { file: 'kyoto-temple.jpg', title: 'Kyoto temple in autumn', hue: 16, tags: ['kyoto', 'temple', 'autumn', 'architecture', 'calm', 'japanese', 'japan', 'asia', 'kiyomizu-dera', 'red leaves', 'trees'] },
      { file: 'safari-elephants.jpg', title: 'Elephant and calf on safari', hue: 44, tags: ['elephants', 'safari', 'wildlife', 'animal', 'baby animal', 'african', 'africa', 'mammal', 'herbivore', 'calf', 'vehicle'] },
      { file: 'cappadocia-balloons.jpg', title: 'Balloons over Göreme', hue: 22, tags: ['hot air balloons', 'cappadocia', 'rock formations', 'sky', 'adventure', 'turkish', 'turkey', 'goreme', 'aircraft', 'vehicle', 'valley'] },
      { file: 'havana-car.jpg', title: 'Vintage car in Havana', hue: 340, tags: ['havana', 'vintage car', 'street', 'colorful', 'city', 'cuban', 'cuba', 'yellow', 'classic car', 'vehicle', 'car'] },
      { file: 'lisbon-tram.jpg', title: 'Lisbon tram', hue: 48, tags: ['lisbon', 'tram', 'street', 'city', 'architecture', 'portuguese', 'portugal', 'europe', 'yellow', 'vehicle', 'public transit'] },
      { file: 'paris-cafe.jpg', title: 'Corner café', hue: 26, tags: ['cozy café', 'coffee', 'paris', 'cozy', 'food', 'french', 'france', 'europe', 'restaurant', 'outdoor dining', 'people'] },
      { file: 'road-trip.jpg', title: 'Road into Monument Valley', hue: 196, tags: ['road trip', 'highway', 'monument valley', 'desert', 'adventure', 'american', 'usa', 'utah', 'arizona', 'mesa', 'red rock'] },
      { file: 'holbox-hammock.jpg', title: 'Hammocks on the beach', hue: 178, tags: ['beach', 'hammock', 'sunset', 'calm', 'tropical', 'mexican', 'mexico', 'caribbean', 'people', 'relaxing', 'golden hour'] },
      { file: 'rome-colosseum.jpg', title: 'Colosseum', hue: 32, tags: ['colosseum', 'rome', 'ruins', 'landmark', 'architecture', 'italian', 'italy', 'europe', 'ancient', 'roman', 'night'] },
      { file: 'amsterdam-bikes.jpg', title: 'Canal bridge and bikes', hue: 12, tags: ['amsterdam', 'bikes', 'canal', 'bridge', 'city', 'dutch', 'netherlands', 'europe', 'bicycle', 'vehicle', 'houses'] },
      { file: 'great-wall.jpg', title: 'Great Wall', hue: 90, tags: ['great wall', 'china', 'mountains', 'landmark', 'adventure', 'chinese', 'asia', 'ancient', 'hills', 'green', 'unesco'] },
      { file: 'sydney-opera.jpg', title: 'Sydney Opera House at night', hue: 200, tags: ['sydney', 'opera house', 'harbor', 'night', 'landmark', 'australian', 'australia', 'water', 'lights', 'skyline'] },
      { file: 'norway-fjord.jpg', title: 'Norwegian fjord', hue: 194, tags: ['fjord', 'norway', 'mountains', 'water', 'nature', 'norwegian', 'europe', 'scandinavia', 'valley', 'clouds', 'unesco'] },
      { file: 'cherry-blossoms.jpg', title: 'Cherry blossoms by the tracks', hue: 330, tags: ['cherry blossoms', 'spring', 'pink', 'railway', 'calm', 'japanese', 'japan', 'trees', 'flowers', 'sakura', 'plant'] },
      { file: 'lantern-festival.jpg', title: 'Lantern festival', hue: 6, tags: ['lanterns', 'festival', 'night', 'colorful', 'warm', 'chilean', 'chile', 'south america', 'lights', 'flowers', 'art'] }
    ]
  },
  misc: {
    name: 'Misc',
    dir: 'images/misc/',
    color: '#7a5bc4',
    suggest: ['car', 'grandma', 'children', 'animal', 'planets', 'flowers'],
    items: [
      { file: 'stickothy.svg', title: 'Stickothy', hue: 48, tags: ['stickothy', 'handsome', 'stick figure', 'drawing', 'idle', 'standing', 'hands on hips', 'cartoon', 'character', 'pencil', 'black and white', 'guide', 'mascot', 'portfolio'] },
      { file: 'flower-bee.webm', poster: 'flower-bee.jpg', video: true, length: '0:08', title: 'Flower bee in its nest hole', hue: 30, tags: ['video', 'clip', 'bee', 'hairy-footed flower bee', 'bug', 'insect', 'animal', 'pollinator', 'herbivore', 'bee hotel', 'nest', 'wood', 'macro', 'close-up'] },
      { file: 'christmas-lights.webm', poster: 'christmas-lights.jpg', video: true, length: '0:10', title: 'House in Christmas lights', hue: 280, tags: ['video', 'clip', 'christmas', 'xmas', 'christmas lights', 'holiday', 'house', 'decorations', 'snowman', 'night', 'colorful', 'december', 'winter', 'neighborhood'] },
      { file: 'jupiter.jpg', title: 'Jupiter’s clouds', hue: 216, tags: ['jupiter', 'planet', 'space', 'clouds', 'blue', 'gas giant', 'nasa', 'juno', 'solar system', 'storms', 'astronomy'] },
      { file: 'saturn.jpg', title: 'Saturn from above', hue: 40, tags: ['saturn', 'planet', 'space', 'rings', 'dark', 'gas giant', 'nasa', 'cassini', 'solar system', 'astronomy'] },
      { file: 'mars.jpg', title: 'Mars', hue: 14, tags: ['mars', 'planet', 'space', 'red', 'globe', 'rocky planet', 'red planet', 'esa', 'solar system', 'astronomy'] },
      { file: 'monstera.jpg', title: 'Monstera leaf', hue: 130, tags: ['monstera', 'plant', 'leaf', 'houseplant', 'green', 'tropical', 'swiss cheese plant', 'foliage', 'indoor'] },
      { file: 'sunflowers.jpg', title: 'Sunflower field', hue: 50, tags: ['sunflowers', 'plant', 'flowers', 'field', 'yellow', 'summer', 'farm', 'agriculture', 'bright'] },
      { file: 'saguaro.jpg', title: 'Saguaro cacti', hue: 90, tags: ['cactus', 'saguaro', 'plant', 'desert', 'arizona', 'succulent', 'american', 'usa', 'mountains', 'national park', 'sonoran desert'] },
      { file: 'monarch.jpg', title: 'Monarch butterfly', hue: 28, tags: ['butterfly', 'monarch', 'bug', 'insect', 'orange', 'pollinator', 'herbivore', 'wings', 'lepidoptera', 'animal'] },
      { file: 'ladybug.jpg', title: 'Ladybug on a leaf', hue: 2, tags: ['ladybug', 'bug', 'insect', 'leaf', 'red', 'beetle', 'ladybird', 'carnivore', 'predator', 'spots', 'animal'] },
      { file: 'honeybee.jpg', title: 'Honey bee on an aster', hue: 280, tags: ['bee', 'bug', 'insect', 'flower', 'purple', 'pollinator', 'herbivore', 'aster', 'macro', 'animal', 'nectar'] },
      { file: 'laptop.jpg', title: 'Laptop on a desk', hue: 220, tags: ['laptop', 'technology', 'computer', 'desk', 'office', 'apple', 'macbook', 'workspace', 'books', 'lamp', 'minimal'] },
      { file: 'smartphone.jpg', title: 'Phone in hand', hue: 230, tags: ['smartphone', 'phone', 'technology', 'iphone', 'hand', 'apple', 'mobile', 'device', 'black', 'smartwatch', 'person'] },
      { file: 'circuit-board.jpg', title: 'Circuit board', hue: 36, tags: ['circuit board', 'electronics', 'technology', 'chips', 'close-up', 'pcb', 'hardware', 'components', 'capacitors', 'engineering'] },
      { file: 'grandmother.jpg', title: 'Grandmother and granddaughter', hue: 100, tags: ['grandmother', 'girl', 'older woman', 'family', 'people', 'laos', 'lao', 'asia', 'rice field', 'farm', 'female', 'child', 'elderly', 'person'] },
      { file: 'grandfather.jpg', title: 'Older man, thinking', hue: 0, tags: ['older man', 'grandfather', 'portrait', 'black and white', 'people', 'greek', 'greece', 'elderly', 'male', 'senior', 'person'] },
      { file: 'young-woman.jpg', title: 'Young woman portrait', hue: 340, tags: ['young woman', 'woman', 'portrait', 'adult', 'people', 'asian', 'female', 'dress', 'outdoors', 'person'] },
      { file: 'young-man.jpg', title: 'Smiling teenage boy', hue: 30, tags: ['teenage boy', 'teen', 'smiling', 'portrait', 'people', 'male', 'teenager', 'happy', 'headshot', 'person'] },
      { file: 'kids-playing.jpg', title: 'Kids playing with hoops', hue: 40, tags: ['kids', 'children', 'boys', 'playing', 'people', 'bangladesh', 'asia', 'hoops', 'bicycle wheels', 'child', 'male', 'person'] },
      { file: 'christmas-tree.jpg', title: 'Decorating the Christmas tree', hue: 120, tags: ['christmas', 'xmas', 'christmas tree', 'holiday', 'child', 'ornaments', 'decorations', 'december', 'christian', 'boy', 'person', 'winter'] },
      { file: 'hanukkah.jpg', title: 'Hanukkah menorah', hue: 220, tags: ['hanukkah', 'menorah', 'candles', 'holiday', 'jewish', 'chanukah', 'festival of lights', 'december', 'judaism', 'kitchen'] },
      { file: 'diwali.jpg', title: 'Diwali diyas', hue: 30, tags: ['diwali', 'diyas', 'lamps', 'holiday', 'candles', 'festival of lights', 'hindu', 'indian', 'flames', 'oil lamps'] },
      { file: 'tesla.jpg', title: 'Tesla Model 3', hue: 356, tags: ['tesla', 'model 3', 'car', 'electric', 'red', 'vehicle', 'electric vehicle', 'ev', 'sedan', 'american'] },
      { file: 'mustang.jpg', title: 'Classic Ford Mustang', hue: 0, tags: ['ford', 'mustang', 'car', 'classic', 'red', 'vehicle', 'muscle car', 'american', 'vintage', 'steering wheel'] },
      { file: 'porsche.jpg', title: 'Porsche 911', hue: 220, tags: ['porsche', '911', 'car', 'sports car', 'grey', 'vehicle', 'german', 'coupe', 'luxury', 'fast'] },
      { file: 'vw-beetle.jpg', title: 'Volkswagen New Beetle', hue: 216, tags: ['volkswagen', 'vw', 'beetle', 'car', 'blue', 'vehicle', 'german', 'hatchback', 'spoiler', 'compact'] },
      { file: 'jeep.jpg', title: 'Jeep Wrangler', hue: 0, tags: ['jeep', 'wrangler', 'car', 'off-road', 'black', 'vehicle', 'american', '4x4', 'truck', 'rubicon'] },
      { file: 'toyota.jpg', title: 'Toyota Corolla Cross', hue: 210, tags: ['toyota', 'corolla', 'car', 'suv', 'silver', 'vehicle', 'japanese', 'hybrid', 'crossover', 'family car'] }
    ]
  }
};

// Words people type that should land on a tag. Keys and values are both searchable.
window.FINDER_SYNONYMS = {
  beach: ['shore', 'shoreline', 'seaside', 'coast', 'coastal'],
  ocean: ['sea', 'marine', 'water', 'waves'],
  underwater: ['undersea', 'subsea', 'diving'],
  animal: ['animals', 'creature', 'creatures', 'wildlife', 'critter'],
  calm: ['peaceful', 'serene', 'relaxing', 'quiet', 'tranquil', 'chill', 'cozy'],
  cozy: ['warm', 'snug', 'comfy', 'homey', 'calm'],
  evening: ['night', 'dusk', 'sunset', 'twilight'],
  night: ['evening', 'dark', 'nighttime'],
  golden: ['gold', 'warm', 'sunset', 'sunrise', 'yellow'],
  warm: ['golden', 'cozy', 'sunset'],
  food: ['eat', 'eating', 'meal', 'snack', 'restaurant', 'street food', 'coffee'],
  city: ['urban', 'downtown', 'skyline', 'street'],
  mountains: ['mountain', 'peaks', 'hills', 'alpine', 'hiking'],
  science: ['research', 'lab', 'scientist', 'study'],
  landmark: ['famous', 'monument', 'sightseeing'],
  whale: ['whales', 'humpback'],
  boat: ['ship', 'vessel', 'gondola'],
  cute: ['adorable', 'sweet'],
  architecture: ['building', 'buildings', 'temple', 'ruins'],
  adventure: ['explore', 'exploring', 'hiking', 'road trip'],
  colorful: ['vibrant', 'bright', 'neon'],
  handsome: ['good looking', 'cute', 'attractive', 'hot'],
  planet: ['planets', 'space', 'solar system', 'astronomy'],
  plant: ['plants', 'greenery', 'flora', 'botany'],
  bug: ['bugs', 'insect', 'insects', 'critter', 'beetle', 'butterfly', 'bee'],
  vehicle: ['vehicles', 'transport', 'transportation'],
  british: ['uk', 'england', 'english', 'britain', 'london'],
  carnivore: ['carnivores', 'meat eater', 'predator'],
  herbivore: ['herbivores', 'plant eater'],
  mammal: ['mammals'],
  bird: ['birds'],
  bermuda: ['bios', 'atlantic explorer'],
  video: ['videos', 'clip', 'clips', 'footage', 'movie', 'moving'],
  technology: ['tech', 'gadget', 'gadgets', 'electronics', 'computer'],
  car: ['cars', 'vehicle', 'automobile', 'auto'],
  grandmother: ['grandma', 'granny', 'nana', 'older woman'],
  grandfather: ['grandpa', 'granddad', 'older man'],
  kids: ['kid', 'children', 'child', 'boys', 'girls'],
  woman: ['women', 'lady', 'female', 'girl'],
  man: ['men', 'guy', 'male', 'boy'],
  holiday: ['holidays', 'festive', 'celebration', 'christmas', 'hanukkah', 'diwali'],
  christmas: ['xmas', 'noel'],
  hanukkah: ['chanukah', 'hanukah'],
  volkswagen: ['vw']
};

// Stable, scattered demo capture dates: re-importing a folder keeps its dates.
for (const [key, folder] of Object.entries(window.FINDER_FOLDERS)) {
  folder.items.forEach(item => {
    if (key !== 'ocean' && key !== 'travel') return;
    let seed = 2166136261;
    for (const char of item.file) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
    const year = key === 'ocean' ? 2026 : 2022 + seed % 5;
    const month = key === 'ocean' ? (item.tags.includes('bermuda') ? 7 : 3) : 1 + (seed >>> 8) % 12;
    const day = 1 + (seed >>> 16) % 28;
    item.date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  });
}
