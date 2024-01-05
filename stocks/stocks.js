// Create stock item
function createStockItem(stockSymbol, stockInfo) {
  const item = document.createElement('div');
  item.className = 'stockItem';
  item.innerHTML = `
    <span class="stockSymbol">${stockSymbol}</span>
    <span class="stockInfo">Open: ${stockInfo.dailyBar?.o} | High: ${stockInfo.dailyBar?.h} | Low: ${stockInfo.dailyBar?.l}</span>
  `;
  return item;
}

// Initialize the stock board
function initStockBoard(stockData) {
  const stockBoard = document.getElementById('stockBoard');
  for (const [symbol, info] of Object.entries(stockData)) {
    if (isValidSymbol(symbol)) {
      const stockItem = createStockItem(symbol, info);
      stockBoard.appendChild(stockItem);
    }
  }
}

function isValidSymbol(str) {
  // Check if the string is all uppercase letters
  const isUppercase = /^[A-Z]+$/.test(str);

  return isUppercase;
}

// Fetch stock data
fetch('https://green-stonks-21.joshsi.workers.dev/')
.then(response => {
  if (!response.ok) {
    throw new Error('Network response failed');
  }
  return response.json();
})
.then(data => {
  // Initialize board with fetched data
  initStockBoard(data);
})
.catch(err => {
  console.error('Fetch failed:', err);
});

document.addEventListener('DOMContentLoaded', initStockBoard);
