import { db } from './server/db';
import { cachedSuppliers } from './shared/schema';

async function loadExtensiveSuppliers() {
  console.log('\n🚀 LOADING EXTENSIVE SUPPLIER DATASET');
  console.log('=' .repeat(60));
  
  try {
    // Clear existing cache first
    console.log('🧹 Clearing old cache...');
    await db.delete(cachedSuppliers);
    
    // Generate extensive supplier dataset
    const extensiveSuppliers = [];
    
    // Fortune 500 companies with variations
    const fortune500 = [
      // Top Tech Companies
      'Apple Inc', 'Microsoft Corporation', 'Amazon.com Inc', 'Alphabet Inc', 'Meta Platforms Inc',
      'Tesla Inc', 'NVIDIA Corporation', 'Intel Corporation', 'Oracle Corporation', 'Cisco Systems Inc',
      'Adobe Inc', 'Salesforce Inc', 'IBM Corporation', 'SAP SE', 'VMware Inc',
      'PayPal Holdings Inc', 'Netflix Inc', 'Uber Technologies Inc', 'Square Inc', 'Twitter Inc',
      'Spotify Technology', 'Zoom Video Communications', 'Snowflake Inc', 'Palantir Technologies',
      'Airbnb Inc', 'DoorDash Inc', 'Instacart', 'Stripe Inc', 'Databricks', 'Canva',
      
      // Retail & Consumer
      'Walmart Inc', 'Target Corporation', 'Home Depot Inc', 'Lowes Companies Inc', 'Costco Wholesale',
      'Kroger Co', 'Walgreens Boots Alliance', 'CVS Health Corporation', 'Best Buy Co Inc', 'TJX Companies',
      'Dollar General Corporation', 'Dollar Tree Inc', 'Ross Stores Inc', 'Gap Inc', 'Nordstrom Inc',
      'Macys Inc', 'Kohls Corporation', 'JC Penney Company', 'Bed Bath & Beyond', 'Williams Sonoma',
      'Wayfair Inc', 'Chewy Inc', 'Petco Health and Wellness', 'GameStop Corp', 'Barnes & Noble',
      
      // Food & Restaurants  
      'McDonalds Corporation', 'Starbucks Corporation', 'Yum Brands Inc', 'Restaurant Brands International',
      'Chipotle Mexican Grill', 'Dominos Pizza Inc', 'Dunkin Brands Group', 'Subway', 'Wendys Company',
      'Burger King Corporation', 'Pizza Hut LLC', 'KFC Corporation', 'Taco Bell Corp', 'Chick-fil-A Inc',
      'Panera Bread Company', 'Five Guys Enterprises', 'In-N-Out Burger', 'Shake Shack Inc', 'Sweetgreen',
      'Panda Express', 'Jack in the Box Inc', 'Sonic Drive-In', 'Arbys Restaurant Group', 'Jimmy Johns',
      
      // Financial Services
      'JPMorgan Chase & Co', 'Bank of America Corporation', 'Wells Fargo & Company', 'Citigroup Inc',
      'Goldman Sachs Group', 'Morgan Stanley', 'US Bancorp', 'PNC Financial Services', 'Truist Financial',
      'Capital One Financial', 'TD Bank NA', 'Bank of New York Mellon', 'State Street Corporation',
      'Charles Schwab Corporation', 'American Express Company', 'Discover Financial Services',
      'Synchrony Financial', 'Ally Financial Inc', 'Regions Financial Corporation', 'Fifth Third Bancorp',
      'KeyCorp', 'Huntington Bancshares', 'M&T Bank Corporation', 'Citizens Financial Group',
      'Visa Inc', 'Mastercard Incorporated', 'PayPal Holdings Inc', 'Block Inc', 'Fidelity Investments',
      
      // Healthcare & Pharma
      'UnitedHealth Group Inc', 'Anthem Inc', 'Aetna Inc', 'Cigna Corporation', 'Humana Inc',
      'Centene Corporation', 'Molina Healthcare Inc', 'WellCare Health Plans', 'Kaiser Permanente',
      'Blue Cross Blue Shield', 'Johnson & Johnson', 'Pfizer Inc', 'Merck & Co Inc', 'AbbVie Inc',
      'Bristol-Myers Squibb', 'Eli Lilly and Company', 'Amgen Inc', 'Gilead Sciences Inc', 'Moderna Inc',
      'CVS Caremark', 'Express Scripts', 'OptumRx', 'Walgreens Boots Alliance', 'Rite Aid Corporation',
      
      // Transportation & Logistics
      'United Parcel Service', 'FedEx Corporation', 'DHL Express', 'US Postal Service', 'XPO Logistics',
      'JB Hunt Transport Services', 'Schneider National', 'Werner Enterprises', 'Knight-Swift Transportation',
      'Old Dominion Freight Line', 'YRC Worldwide', 'Saia Inc', 'ArcBest Corporation', 'Landstar System',
      'CH Robinson Worldwide', 'Expeditors International', 'Hub Group Inc', 'Forward Air Corporation',
      'Delta Air Lines Inc', 'United Airlines Holdings', 'American Airlines Group', 'Southwest Airlines Co',
      'Alaska Air Group', 'JetBlue Airways Corporation', 'Spirit Airlines Inc', 'Frontier Airlines',
      
      // Telecom & Media
      'AT&T Inc', 'Verizon Communications', 'T-Mobile US Inc', 'Comcast Corporation', 'Charter Communications',
      'Cox Communications', 'Dish Network Corporation', 'DirecTV', 'CenturyLink Inc', 'Frontier Communications',
      'Windstream Holdings', 'Consolidated Communications', 'Cable One Inc', 'Altice USA',
      'Walt Disney Company', 'Netflix Inc', 'Warner Bros Discovery', 'Paramount Global', 'Fox Corporation',
      'NBCUniversal Media', 'Sony Pictures Entertainment', 'Lions Gate Entertainment', 'AMC Networks',
      
      // Energy & Utilities
      'Exxon Mobil Corporation', 'Chevron Corporation', 'ConocoPhillips', 'Phillips 66', 'Marathon Petroleum',
      'Valero Energy Corporation', 'Shell USA Inc', 'BP America Inc', 'Occidental Petroleum', 'EOG Resources',
      'Duke Energy Corporation', 'Southern Company', 'NextEra Energy Inc', 'Dominion Energy Inc', 'Exelon Corporation',
      'American Electric Power', 'Sempra Energy', 'Xcel Energy Inc', 'WEC Energy Group', 'Consolidated Edison',
      'PG&E Corporation', 'Edison International', 'FirstEnergy Corp', 'Entergy Corporation', 'Public Service Enterprise',
      
      // Manufacturing & Industrial
      'General Electric Company', 'Boeing Company', 'Lockheed Martin Corporation', 'Raytheon Technologies',
      'Northrop Grumman Corporation', 'General Dynamics Corporation', 'L3Harris Technologies', 'Textron Inc',
      'Honeywell International', '3M Company', 'Caterpillar Inc', 'Deere & Company', 'Cummins Inc',
      'PACCAR Inc', 'Navistar International', 'Oshkosh Corporation', 'AGCO Corporation', 'CNH Industrial',
      'General Motors Company', 'Ford Motor Company', 'Stellantis NV', 'Tesla Inc', 'Rivian Automotive',
      'Lucid Motors Inc', 'Nikola Corporation', 'Workhorse Group Inc', 'Canoo Inc', 'Fisker Inc',
      
      // Construction & Real Estate
      'DR Horton Inc', 'Lennar Corporation', 'PulteGroup Inc', 'NVR Inc', 'Toll Brothers Inc',
      'KB Home', 'Taylor Morrison Home', 'Meritage Homes Corporation', 'Century Communities', 'MDC Holdings',
      'Turner Construction Company', 'Bechtel Corporation', 'Fluor Corporation', 'Jacobs Engineering Group',
      'AECOM Technology Corporation', 'Kiewit Corporation', 'Whiting-Turner Contracting', 'Clark Construction Group',
      'Skanska USA', 'PCL Construction Enterprises', 'Mortenson Construction', 'DPR Construction',
      'CBRE Group Inc', 'Jones Lang LaSalle', 'Cushman & Wakefield', 'Colliers International', 'Marcus & Millichap',
      
      // Insurance
      'State Farm Insurance', 'GEICO', 'Progressive Corporation', 'Allstate Corporation', 'Liberty Mutual',
      'USAA', 'Farmers Insurance Group', 'Nationwide Mutual', 'Travelers Companies', 'Hartford Financial Services',
      'American Family Insurance', 'Auto-Owners Insurance', 'Erie Insurance Group', 'Mercury Insurance Group',
      'Kemper Corporation', 'MetLife Inc', 'Prudential Financial', 'New York Life Insurance', 'Northwestern Mutual',
      'MassMutual', 'Guardian Life Insurance', 'Principal Financial Group', 'Lincoln National Corporation',
      
      // Professional Services
      'Deloitte LLP', 'PricewaterhouseCoopers', 'Ernst & Young LLP', 'KPMG LLP', 'Accenture plc',
      'McKinsey & Company', 'Boston Consulting Group', 'Bain & Company', 'Oliver Wyman', 'AT Kearney',
      'Booz Allen Hamilton', 'CACI International', 'SAIC', 'Leidos Holdings', 'General Dynamics IT',
      'CGI Group Inc', 'Cognizant Technology Solutions', 'Infosys Limited', 'Tata Consultancy Services',
      'Wipro Limited', 'HCL Technologies', 'Tech Mahindra', 'Capgemini SE', 'Atos SE', 'DXC Technology',
      
      // Office Supplies & Services
      'Staples Inc', 'Office Depot Inc', 'WB Mason Company', 'Quill Corporation', 'Corporate Express',
      'CDW Corporation', 'Insight Enterprises', 'Connection Inc', 'SHI International', 'Zones Inc',
      'Grainger Inc', 'Fastenal Company', 'MSC Industrial Direct', 'HD Supply Holdings', 'Applied Industrial Technologies',
      'Motion Industries', 'Kaman Corporation', 'DXP Enterprises', 'Lawson Products', 'Genuine Parts Company',
      'Cintas Corporation', 'UniFirst Corporation', 'Aramark Corporation', 'ABM Industries', 'ISS Facility Services',
      'Compass Group USA', 'Sodexo Inc', 'Delaware North Companies', 'Centerplate', 'Levy Restaurants',
      
      // Hotels & Hospitality
      'Marriott International', 'Hilton Worldwide Holdings', 'InterContinental Hotels Group', 'Wyndham Hotels & Resorts',
      'Choice Hotels International', 'Hyatt Hotels Corporation', 'Radisson Hotel Group', 'Best Western Hotels',
      'La Quinta Inns & Suites', 'Red Roof Inn', 'Motel 6', 'Extended Stay America', 'Omni Hotels & Resorts',
      'Four Seasons Hotels', 'Ritz-Carlton Hotel Company', 'Mandarin Oriental Hotel Group', 'Fairmont Hotels & Resorts',
      'Waldorf Astoria Hotels', 'Conrad Hotels & Resorts', 'DoubleTree by Hilton', 'Hampton by Hilton',
      'Holiday Inn Hotels', 'Crowne Plaza Hotels', 'Sheraton Hotels & Resorts', 'Westin Hotels & Resorts',
      
      // Education & Training
      'Pearson Education', 'McGraw Hill Education', 'Cengage Learning', 'Houghton Mifflin Harcourt',
      'Scholastic Corporation', 'Wiley & Sons', 'Macmillan Publishers', 'Elsevier', 'Springer Nature',
      'Oxford University Press', 'Cambridge University Press', 'SAGE Publications', 'Taylor & Francis',
      'Coursera Inc', 'Udemy Inc', 'LinkedIn Learning', 'Pluralsight Inc', 'Skillsoft Corporation',
      'Blackboard Inc', 'Canvas by Instructure', 'Moodle Pty Ltd', 'D2L Corporation', 'Schoology Inc',
      
      // Equipment Rental
      'United Rentals Inc', 'Sunbelt Rentals', 'Herc Rentals', 'BlueLine Rental', 'Home Depot Tool Rental',
      'Ahern Rentals', 'Neff Rental', 'Maxim Crane Works', 'Bigge Crane and Rigging', 'ALL Erection & Crane Rental',
      'NES Rentals', 'Rental Service Corporation', 'Star Rentals Inc', 'EquipmentShare', 'BigRentz Inc',
      
      // Automotive Services
      'AutoZone Inc', 'OReilly Automotive', 'Advance Auto Parts', 'Genuine Parts Company', 'CarMax Inc',
      'Carvana Co', 'Vroom Inc', 'CarGurus Inc', 'Cars.com Inc', 'TrueCar Inc',
      'Penske Automotive Group', 'AutoNation Inc', 'Sonic Automotive', 'Group 1 Automotive', 'Lithia Motors',
      'Firestone Complete Auto Care', 'Jiffy Lube', 'Midas International', 'Meineke Car Care Centers', 'Maaco',
      'AAMCO Transmissions', 'Precision Tune Auto Care', 'Valvoline Instant Oil Change', 'Grease Monkey', 'Mr. Lube'
    ];
    
    // Add each company with variations
    for (const company of fortune500) {
      // Original name
      extensiveSuppliers.push({
        name: company.toUpperCase(),
        type: determinePaymentType(company)
      });
      
      // Common variations
      const baseName = company.replace(/\s+(Inc|LLC|Ltd|Corporation|Corp|Company|Co|Group|Holdings|Enterprises|Services|Solutions|Technologies|International|USA|US|NA|plc|SE|AG|NV|GmbH|Limited|LLP)\.?$/gi, '').trim();
      
      // Add variations
      if (baseName !== company) {
        extensiveSuppliers.push({
          name: baseName.toUpperCase(),
          type: determinePaymentType(company)
        });
        
        // Add abbreviated version
        if (baseName.includes(' ')) {
          const abbrev = baseName.split(' ').map(w => w[0]).join('');
          if (abbrev.length >= 2) {
            extensiveSuppliers.push({
              name: abbrev.toUpperCase(),
              type: determinePaymentType(company)
            });
          }
        }
      }
    }
    
    // Add regional and local suppliers
    const regionalSuppliers = [
      // Regional utilities
      'ConEd', 'PG&E', 'SoCal Edison', 'Georgia Power', 'Florida Power & Light',
      'Puget Sound Energy', 'Portland General Electric', 'Idaho Power', 'NV Energy', 'Arizona Public Service',
      
      // Regional banks
      'Silicon Valley Bank', 'First Republic Bank', 'Signature Bank', 'Zions Bank', 'Comerica Bank',
      'First Hawaiian Bank', 'Bank of Hawaii', 'Alaska USA Federal Credit Union', 'Navy Federal Credit Union',
      
      // Regional grocery chains
      'Publix Super Markets', 'HEB Grocery', 'Wegmans Food Markets', 'Safeway Inc', 'Albertsons Companies',
      'ShopRite', 'Stop & Shop', 'Giant Eagle', 'Meijer Inc', 'Hy-Vee Inc',
      
      // Regional service providers
      'Roto-Rooter', 'ServiceMaster', 'Stanley Steemer', 'Terminix', 'Orkin',
      'ADT Security Services', 'Brinks Home Security', 'Vivint Smart Home', 'Protection 1', 'Bay Alarm',
      
      // Common vendors
      'Xerox Corporation', 'Canon USA Inc', 'Ricoh USA Inc', 'Konica Minolta', 'Sharp Electronics',
      'ADP Inc', 'Paychex Inc', 'Intuit Inc', 'Square Inc', 'Toast Inc',
      'Sysco Corporation', 'US Foods', 'Performance Food Group', 'Gordon Food Service', 'Ben E Keith Company'
    ];
    
    // Add regional suppliers
    for (const supplier of regionalSuppliers) {
      extensiveSuppliers.push({
        name: supplier.toUpperCase(),
        type: determinePaymentType(supplier)
      });
    }
    
    // Process in batches
    const batchSize = 100;
    let totalInserted = 0;
    
    console.log(`📦 Processing ${extensiveSuppliers.length} suppliers...`);
    
    for (let i = 0; i < extensiveSuppliers.length; i += batchSize) {
      const batch = extensiveSuppliers.slice(i, i + batchSize);
      
      const suppliers = batch.map((s, idx) => ({
        payeeId: `EXT_${i + idx}_${Date.now()}`,
        payeeName: s.name,
        normalizedName: s.name.toLowerCase().replace(/[^a-z0-9]/g, ''),
        paymentType: s.type,
      }));
      
      await db.insert(cachedSuppliers).values(suppliers);
      totalInserted += batch.length;
      
      if (totalInserted % 500 === 0) {
        console.log(`  ✓ Inserted ${totalInserted} suppliers...`);
      }
    }
    
    console.log(`\n✅ Successfully loaded ${totalInserted} extensive suppliers`);
    
    // Verify the data
    const count = await db.select({ count: db.sql<number>`COUNT(*)` })
      .from(cachedSuppliers);
    
    console.log(`📊 Total suppliers in cache: ${count[0]?.count || 0}`);
    console.log('\n' + '='.repeat(60));
    console.log('✅ EXTENSIVE SUPPLIER DATASET LOADED SUCCESSFULLY');
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('\n❌ Error loading suppliers:', error);
  } finally {
    process.exit(0);
  }
}

function determinePaymentType(companyName: string): string {
  const name = companyName.toLowerCase();
  
  // Wire transfers for large financial, consulting, enterprise
  if (name.includes('bank') || name.includes('financial') || name.includes('morgan') || 
      name.includes('sachs') || name.includes('consulting') || name.includes('deloitte') ||
      name.includes('ernst') || name.includes('kpmg') || name.includes('pwc')) {
    return 'Wire';
  }
  
  // ACH for tech companies and regular vendors
  if (name.includes('software') || name.includes('technologies') || name.includes('microsoft') ||
      name.includes('amazon') || name.includes('google') || name.includes('apple')) {
    return 'ACH';
  }
  
  // Cards for retail and small purchases
  if (name.includes('store') || name.includes('depot') || name.includes('mart') ||
      name.includes('restaurant') || name.includes('coffee') || name.includes('food')) {
    return 'Card';
  }
  
  // Default to CHECK for traditional vendors
  return 'CHECK';
}

// Run the script
loadExtensiveSuppliers();