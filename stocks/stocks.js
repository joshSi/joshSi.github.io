// Create stock item
function createStockItem(stockSymbol, stockInfo) {
  const item = document.createElement('tr');

  // Create data cells
  const symbolCell = document.createElement('td');
  const openCell = document.createElement('td');
  const dayHighCell = document.createElement('td');
  const dayLowCell = document.createElement('td');
  const dayOpenCell = document.createElement('td');
  const dayCloseCell = document.createElement('td');
  const changeCell = document.createElement('td');

  // Set content for data cells
  symbolCell.textContent = stockSymbol;
  openCell.textContent = stockInfo.minuteBar?.o;
  dayHighCell.textContent = stockInfo.dailyBar?.h;
  dayLowCell.textContent = stockInfo.dailyBar?.l;
  dayOpenCell.textContent = stockInfo.dailyBar?.o;
  dayCloseCell.textContent = stockInfo.latestTrade?.p || stockInfo.minuteBar?.c;
  const change = (dayCloseCell.textContent / stockInfo.prevDailyBar?.c - 1) * 100

  changeCell.textContent = `${change >= 0 ? '+' : '-'} ${Math.abs(change.toFixed(4))} %`;

  // Append data cells to the row
  item.appendChild(symbolCell);
  item.appendChild(openCell);
  item.appendChild(dayHighCell);
  item.appendChild(dayLowCell);
  item.appendChild(dayOpenCell);
  item.appendChild(dayCloseCell);
  item.appendChild(changeCell);

  return item;
}

// Initialize the stock board
function initStockBoard(stockData) {
  const stockBoard = document.getElementById('stockBoard');

  const table = document.createElement('table');

  // Table header
  const headerRow = document.createElement('tr');
  const headerCells = ['Symbol', 'Open', 'Day High', 'Day Low', 'Day Open', 'Day Close', '% from prev close'];
  headerCells.forEach(headerText => {
    const headerCell = document.createElement('th');
    headerCell.textContent = headerText;
    headerRow.appendChild(headerCell);
  });
  table.appendChild(headerRow);

  // Table content
  Object.entries(stockData).forEach(([symbol, info]) => {
    if (isValidSymbol(symbol)) {
      const stockItem = createStockItem(symbol, info);
      table.appendChild(stockItem);
    }
  });

  stockBoard.appendChild(table);
}

function isValidSymbol(str) {
  // Check if the string is all uppercase letters
  const isUppercase = /^[A-Z]+$/.test(str);

  return isUppercase;
}

// Fetch stock data
fetch('https://api.joshsi.com/stocks')
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
