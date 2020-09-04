'use strict';

const v1 = {
  'version': '1.0',
  'resource': '/my/path',
  'path': '/my/path',
  'httpMethod': 'GET',
  'headers': {
    'X-Forwarded-Proto': 'https',
    'CloudFront-Forwarded-Proto': 'https',
    'Host': 'úüỏ.macnaughton.zone',
    'X-Forwarded-Port': '443'
  },
  'multiValueHeaders': {
    'X-Forwarded-Proto': ['https'],
    'CloudFront-Forwarded-Proto': ['https'],
    'Host': ['úüỏ.macnaughton.zone'],
    'X-Forwarded-Port': ['443'],
    'Header2': ['value1', 'value2']
  },
  'queryStringParameters': {
    'parameter1': 'value1',
    'parameter2': 'value'
  },
  'multiValueQueryStringParameters': {
    'parameter1': [
      'value1',
      'value2'
    ],
    'parameter2': [
      'value'
    ]
  },
  'requestContext': {
    'accountId': '123456789012',
    'apiId': 'id',
    'authorizer': {
      'claims': null,
      'scopes': null
    },
    'domainName': 'id.execute-api.us-east-1.amazonaws.com',
    'domainPrefix': 'id',
    'extendedRequestId': 'request-id',
    'httpMethod': 'GET',
    'identity': {
      'accessKey': null,
      'accountId': null,
      'caller': null,
      'cognitoAuthenticationProvider': null,
      'cognitoAuthenticationType': null,
      'cognitoIdentityId': null,
      'cognitoIdentityPoolId': null,
      'principalOrgId': null,
      'sourceIp': 'IP',
      'user': null,
      'userAgent': 'user-agent',
      'userArn': null
    },
    'path': '/my/path',
    'protocol': 'HTTP/1.1',
    'requestId': 'id=',
    'requestTime': '04/Mar/2020:19:15:17 +0000',
    'requestTimeEpoch': 1583349317135,
    'resourceId': null,
    'resourcePath': '/my/path',
    'stage': '$default'
  },
  'pathParameters': null,
  'stageVariables': null,
  'body': 'Hello from Lambda!',
  'isBase64Encoded': true
}

const v2 = {
  'version': '2.0',
  'routeKey': '$default',
  'rawPath': '/my/path',
  'rawQueryString': 'parameter1=value1&parameter1=value2&parameter2=value',
  'cookies': [
    'cookie1',
    'cookie2'
  ],
  'headers': {
    'X-Forwarded-Proto': 'https',
    'CloudFront-Forwarded-Proto': 'https',
    'Host': 'úüỏ.macnaughton.zone',
    'X-Forwarded-Port': '443',
    'Header2': 'value1,value2'
  },
  'queryStringParameters': {
    'parameter1': 'value1,value2',
    'parameter2': 'value'
  },
  'requestContext': {
    'accountId': '123456789012',
    'apiId': 'api-id',
    'authorizer': {
      'jwt': {
        'claims': {
          'claim1': 'value1',
          'claim2': 'value2'
        },
        'scopes': [
          'scope1',
          'scope2'
        ]
      }
    },
    'domainName': 'id.execute-api.us-east-1.amazonaws.com',
    'domainPrefix': 'id',
    'http': {
      'method': 'GET',
      'path': '/my/path',
      'protocol': 'HTTP/1.1',
      'sourceIp': 'IP',
      'userAgent': 'agent'
    },
    'requestId': 'id',
    'routeKey': '$default',
    'stage': '$default',
    'time': '12/Mar/2020:19:03:58 +0000',
    'timeEpoch': 1583348638390
  },
  //'body': 'Hello from Lambda',
  'pathParameters': {
    'parameter1': 'value1'
  },
  'isBase64Encoded': false,
  'stageVariables': {
    'stageVariable1': 'value1',
    'stageVariable2': 'value2'
  }
}

module.exports = {
  v1,
  v2
};
