#!/usr/bin/env node

import fetch from 'node-fetch';
import oauth from 'mastercard-oauth1-signer';
import fs from 'fs';

async function checkHomeDepotSearch() {
  console.log('Checking Home Depot search that was polling earlier\n');

  const consumerKey = process.env.MASTERCARD_CONSUMER_KEY;
  const privateKey = fs.readFileSync('./mastercard-private-key.pem', 'utf8');
  const clientId = consumerKey.split('!')[1];

  // The Home Depot search from earlier
  const searchId = 'cdc904cc-cdac-48e8-994a-1aa8e7145330';
  
  // Check status
  const statusUrl = `https://api.mastercard.com/track/search/bulk-searches/${searchId}`;
  const statusAuthHeader = oauth.getAuthorizationHeader(
    statusUrl,
    'GET',
    undefined,
    consumerKey,
    privateKey
  );
  
  const statusResponse = await fetch(statusUrl, {
    method: 'GET',
    headers: {
      'Authorization': statusAuthHeader,
      'Accept': 'application/json',
      'X-Openapi-Clientid': clientId
    }
  });
  
  if (statusResponse.ok) {
    const statusData = await statusResponse.json();
    console.log('Home Depot Search Status:', statusData.status);
    
    if (statusData.status === 'COMPLETED') {
      console.log('\n🎉 Search COMPLETED! Getting results...\n');
      
      const resultsUrl = `https://api.mastercard.com/track/search/bulk-searches/${searchId}/results?search_request_id=&offset=0&limit=25`;
      const resultsAuthHeader = oauth.getAuthorizationHeader(
        resultsUrl,
        'GET',
        undefined,
        consumerKey,
        privateKey
      );

      const resultsResponse = await fetch(resultsUrl, {
        method: 'GET',
        headers: {
          'Authorization': resultsAuthHeader,
          'Accept': 'application/json',
          'X-Openapi-Clientid': clientId
        }
      });

      if (resultsResponse.ok) {
        const data = await resultsResponse.json();
        console.log('Total results:', data.data?.total || 0);
        
        if (data.data?.items && data.data.items.length > 0) {
          console.log('\n✅ FOUND MATCHES FOR HOME DEPOT!\n');
          data.data.items.forEach(item => {
            const details = item.searchResult?.entityDetails;
            const cardData = item.searchResult?.cardProcessingHistory;
            
            console.log('Match Details:');
            console.log('- Business Name:', details?.businessName);
            console.log('- Tax ID:', details?.organisationIdentifications?.[0]?.identification);
            console.log('- MCC Code:', cardData?.mcc);
            console.log('- MCC Group:', cardData?.mccGroup);
            console.log('- Confidence:', item.confidence);
            console.log('- Address:', details?.businessAddress?.addressLine1 + ', ' + 
                       details?.businessAddress?.townName + ', ' + 
                       details?.businessAddress?.countrySubDivision + ' ' + 
                       details?.businessAddress?.postCode);
            console.log('- Phone:', details?.phoneNumber);
            console.log('---');
          });
        }
      } else {
        const error = await resultsResponse.text();
        console.log('Error getting results:', error);
      }
    }
  }
}

checkHomeDepotSearch().catch(console.error);
