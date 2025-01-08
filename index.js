const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  // Launch the browser
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const baseUrl = 'https://www.capitoltrades.com/trades?pageSize=96&page=';

  const path = 'data.json';

  let allRows = [];

  // Check if data.json exists
  if (fs.existsSync(path)) {
    // Read the existing data
    const rawData = fs.readFileSync(path);
    allRows = JSON.parse(rawData);
  } else {
    // Create an empty data.json file
    fs.writeFileSync(path, JSON.stringify([]));
  }

  const parseDate = (dateString) => {

    if (dateString.includes('Today')) {
      const today = new Date();
      return today;
    } else if (dateString.includes('Yesterday')) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      return yesterday;
    }

    const [day, month, year] = dateString.split(' ');
    const monthIndex = new Date(`${month} 1, 2000`).getMonth(); // Get the month index
    return new Date(year, monthIndex, day);
  };

  const parseRowData = (rowData) => {
    const entityInformation = rowData[0];
    const entityRef = entityInformation.split('\n')[0];
    const entityName = entityRef.split('+')[1];
    const entityUrl = entityRef.split('+')[0];
    let entityPosition = entityInformation.split('\n')[1];
    entityPosition = entityPosition.replace('Senate', ' Senate ').replace('House', ' House ');
    const entityParty = entityPosition.split(' ')[0];
    const entityChamber = entityPosition.split(' ')[1];
    const entityState = entityPosition.split(' ')[2];

    const issuer = rowData[1].split('\n');
    const issuerRef = issuer[0];
    const issuerName = issuerRef.split('+')[1];
    const issuerUrl = issuerRef.split('+')[0];
    const issuerTicker = issuer[1];

    const fileDate = parseDate(rowData[2].replace(`\n`, ' '));

    const tradeDate = parseDate(rowData[3].replace(`\n`, ' '));

    const filedAfter = rowData[4].replace(`\n`, ' ');
    const owner = rowData[5];
    const action = rowData[6];
    const size = rowData[7];
    const price = rowData[8];
    const fileRef = rowData[9].split('+')[0];

    return {
      entityName,
      entityUrl,
      entityParty,
      entityChamber,
      entityState,
      issuerName,
      issuerUrl,
      issuerTicker,
      fileDate,
      tradeDate,
      filedAfter,
      owner,
      action,
      size,
      price,
      fileRef
    };
  };


  // Start with page 1
  let currentPageNum = 1;

  // Navigate to the first page
  await page.goto(`${baseUrl}${currentPageNum}`, { waitUntil: 'networkidle' });

  // A helper function to scrape the current table
  async function scrapeCurrentTable() {
    // Wait until table rows are present
    await page.waitForSelector('table tbody tr');

    // Extract data from the table
    const data = await page.evaluate(() => {
      const rows = document.querySelectorAll('table tbody tr');
      const tableData = [];
      rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length > 1) {
          const rowData = Array.from(cells).map(cell => {
            const anchor = cell.querySelector('a');
            let result = '';
            if (anchor)
              result = `${anchor.href}+`;
            result = result + cell.innerText.trim();
            return result;
          });
          tableData.push(rowData);
        }
      });
      return tableData;
    });
    return data;
  }

  let endPagination = false;

  // We’ll keep looping until “Next” is unavailable (disabled) or doesn’t exist.
  while (true && !endPagination) {
    // Scrape data from current page
    const rows = await scrapeCurrentTable();

    // Attempt to find the "Next page" button
    // -- CapitolTrades uses some MUI pagination. The next button typically has aria-label="Next Page".
    //    You may need to inspect the DOM to confirm the exact selector or text used.
    const aria = await page.$('a[aria-label="Go to next page"]');
    const nextBtn = await aria.evaluateHandle(node => node.parentElement);

    if (!nextBtn) {
      // If there's no next button at all, break out
      break;
    }

    // Check if the button is disabled
    const isDisabled = await nextBtn.isDisabled();
    if (isDisabled) {
      // No more pages
      break;
    }

    // If enabled, click next
    await nextBtn.click();

    const parsedRows = rows.map(row => parseRowData(row));

    parsedRows.forEach((obj) => {
      const newData = allRows.findIndex((item) => item.fileRef === obj.fileRef) === -1;
      if (newData) allRows.push(obj);
      else endPagination = true;
    });


    // Wait for the next page to load data
    await page.waitForLoadState('networkidle');
    // Wait for a bit (2 seconds) to ensure all data is loaded
    await page.waitForTimeout(4000);

    // Increment page counter (mostly optional, just for clarity)
    currentPageNum++;
    // Wait for the page to contain the current page number
    // await page.waitForFunction(
    //   (pageNum) => document.querySelector('a[aria-label="Go to next page"]').parentNode.parentNode.innerText.includes(pageNum),
    //   {},
    //   currentPageNum
    // );
  }

  fs.writeFileSync(path, JSON.stringify(allRows, null, 2));

  // Close the browser
  await browser.close();

})();
