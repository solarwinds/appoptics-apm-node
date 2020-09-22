'use strict';

const rest = {
  resource: '/f2',
  path: '/f2',
  httpMethod: 'post',
  headers: {
    Accept: 'application/json, text/plain, */*',
    'CloudFront-Forwarded-Proto': 'https',
    'CloudFront-Is-Desktop-Viewer': 'true',
    'CloudFront-Is-Mobile-Viewer': 'false',
    'CloudFront-Is-SmartTV-Viewer': 'false',
    'CloudFront-Is-Tablet-Viewer': 'false',
    'CloudFront-Viewer-Country': 'US',
    'Content-Type': 'application/json;charset=utf-8',
    Host: 'úüỏ.macnaughton.zone',
    'User-Agent': 'axios/0.20.0',
    Via: '1.1 01afb90e0628e0251f333cf8af249756.cloudfront.net (CloudFront)',
    'X-Amz-Cf-Id': 'FFc-biKDen7ldIWh1a7lJgnWzNJTcZv8E9mTqQnC3K_RQAA8WH5Xww==',
    'X-Amzn-Trace-Id': 'Root=1-5f6a0e7a-5e4842c8a62f3b8835ce5670',
    'X-Forwarded-For': '98.207.88.105, 64.252.173.132',
    'X-Forwarded-Port': '443',
    'X-Forwarded-Proto': 'https'
  },
  multiValueHeaders: {
    Accept: ['application/json, text/plain, */*'],
    'CloudFront-Forwarded-Proto': ['https'],
    'CloudFront-Is-Desktop-Viewer': ['true'],
    'CloudFront-Is-Mobile-Viewer': ['false'],
    'CloudFront-Is-SmartTV-Viewer': ['false'],
    'CloudFront-Is-Tablet-Viewer': ['false'],
    'CloudFront-Viewer-Country': ['US'],
    'Content-Type': ['application/json;charset=utf-8'],
    Host: ['úüỏ.macnaughton.zone'],
    'User-Agent': ['axios/0.20.0'],
    Via: [
      '1.1 01afb90e0628e0251f333cf8af249756.cloudfront.net (CloudFront)'
    ],
    'X-Amz-Cf-Id': ['FFc-biKDen7ldIWh1a7lJgnWzNJTcZv8E9mTqQnC3K_RQAA8WH5Xww=='],
    'X-Amzn-Trace-Id': ['Root=1-5f6a0e7a-5e4842c8a62f3b8835ce5670'],
    'X-Forwarded-For': ['98.207.88.105, 64.252.173.132'],
    'X-Forwarded-Port': ['443'],
    'X-Forwarded-Proto': ['https']
  },
  queryStringParameters: null,
  multiValueQueryStringParameters: null,
  pathParameters: null,
  stageVariables: null,
  requestContext: {
    resourceId: 'e9d58z',
    resourcePath: '/f2',
    httpMethod: 'post',
    extendedRequestId: 'TRczJGOKoAMFwYQ=',
    requestTime: '22/Sep/2020:14:47:22 +0000',
    path: '/api/f2',
    accountId: '858939916050',
    protocol: 'HTTP/1.1',
    stage: 'api',
    domainPrefix: 'gug4hbulf5',
    requestTimeEpoch: 1600786042478,
    requestId: '37479bd0-61d3-4e45-bff1-214894652583',
    identity: {
      cognitoIdentityPoolId: null,
      accountId: null,
      cognitoIdentityId: null,
      caller: null,
      sourceIp: '98.207.88.105',
      principalOrgId: null,
      accessKey: null,
      cognitoAuthenticationType: null,
      cognitoAuthenticationProvider: null,
      userArn: null,
      userAgent: 'axios/0.20.0',
      user: null
    },
    domainName: 'gug4hbulf5.execute-api.us-east-1.amazonaws.com',
    apiId: 'gug4hbulf5'
  }
}

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
  rest,
  v1,
  v2,
};
