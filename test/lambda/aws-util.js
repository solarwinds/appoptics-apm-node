'use strict';

// https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/Lambda.html

const fsp = require('fs').promises;
const exec = require('child_process').exec;

// aws does not read the config file unless this is true. it's easier
// to let the config file supply the keys and region. if this isn't set
// then the keys and region must be supplied when instantiating the AWS
// classes.
process.env.AWS_SDK_LOAD_CONFIG = 'true';

const AWS = require('aws-sdk');
const lambda = new AWS.Lambda();
const cwl = new AWS.CloudWatchLogs();

async function getFileStats (fn) {
  return fsp.stat(fn)
    .then(stats => stats)
    .catch(e => e)
}

async function readFile (fn) {
  return fsp.readFile(fn)
    .catch(e => e);
}

async function execCommandLine (cmdline, options = {}) {
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line no-unused-vars
    const cp = exec(cmdline, options, function (error, stdout, stderr) {
      if (error) {
        reject({error, stdout, stderr});
      } else {
        resolve(stdout, stderr);
      }
    });
  });
}

async function getFunctionInfo (fn, q = undefined) {
  return new Promise((resolve, reject) => {
    const params = {
      FunctionName: fn,
      Qualifier: q,
    };
    lambda.getFunction(params, function (err, data) {
      if (err) {
        reject(err);
      } else {
        resolve(data);
      }
    });
  })
}
/*
data = {
  Code: {
    Location: "https://awslambda-us-west-2-tasks.s3.us-west-2.amazonaws.com/snapshots/123456789012/my-function-e7d9d1ed-xmpl-4f79-904a-4b87f2681f30?versionId=sH3TQwBOaUy...",
    RepositoryType: "S3"
  },
  Configuration: {
    CodeSha256: "YFgDgEKG3ugvF1+pX64gV6tu9qNuIYNUdgJm8nCxsm4=",
    CodeSize: 5797206,
    Description: "Process image objects from Amazon S3.",
    Environment: {
      Variables: {
        "BUCKET": "my-bucket-1xpuxmplzrlbh",
        "PREFIX": "inbound"
      }
    },
    FunctionArn: "arn:aws:lambda:us-west-2:123456789012:function:my-function",
    FunctionName: "my-function",
    Handler: "index.handler",
    KMSKeyArn: "arn:aws:kms:us-west-2:123456789012:key/b0844d6c-xmpl-4463-97a4-d49f50839966",
    LastModified: "2020-04-10T19:06:32.563+0000",
    LastUpdateStatus: "Successful",
    MemorySize: 256,
    RevisionId: "b75dcd81-xmpl-48a8-a75a-93ba8b5b9727",
    Role: "arn:aws:iam::123456789012:role/lambda-role",
    Runtime: "nodejs12.x",
    State: "Active",
    Timeout: 15,
    TracingConfig: {
      Mode: "Active"
    },
    Version: "$LATEST"
  },
  Tags: {
    "DEPARTMENT": "Assets"
  }
}
// */

async function getFunctionConfiguration (fn, options) {
  return new Promise((resolve, reject) => {
    const params = Object.assign({}, options, {FunctionName: fn});
    lambda.getFunctionConfiguration(params, function (err, data) {
      if (err) {
        reject(err);
      } else {
        resolve(data);
      }
    });
  })
    .then(r => r)
    .catch(e => e);
}
/**
node aws-api-survey.js -f 'nodejs-apig-function-9FHBV1SLUTCC'
FUNCTION CONFIGURATION {
  FunctionName: 'nodejs-apig-function-9FHBV1SLUTCC',
  FunctionArn: 'arn:aws:lambda:us-east-1:858939916050:function:nodejs-apig-function-9FHBV1SLUTCC',
  Runtime: 'nodejs12.x',
  Role: 'arn:aws:iam::858939916050:role/nodejs-apig-functionRole-GZEGH0236JNQ',
  Handler: 'index.handler',
  CodeSize: 4025,
  Description: 'Call the AWS Lambda API',
  Timeout: 10,
  MemorySize: 128,
  LastModified: '2020-08-28T17:47:37.373+0000',
  CodeSha256: '6A7qFOBNPnBsSIEFpU0fbTRn4Im2B3bUOxCEbtcrvz4=',
  Version: '$LATEST',
  Environment: {
    Variables: {
      AO_LAMBDA_WAIT: '0',
      APPOPTICS_LOG_SETTINGS: 'error,warn,patching,debug,span,info',
      APPOPTICS_SAMPLE_RATE: '1000000',
      AO_LAMBDA_FS_ENABLED: '1'
    }
  },
  KMSKeyArn: null,
  TracingConfig: { Mode: 'Active' },
  MasterArn: null,
  RevisionId: 'c4f27e1e-ad34-4d75-95f8-ec720de7a4cf',
  Layers: [
    {
      Arn: 'arn:aws:lambda:us-east-1:858939916050:layer:appoptics-apm-layer:31',
      CodeSize: 10833754
    }
  ],
  State: 'Active',
  StateReason: null,
  StateReasonCode: null,
  LastUpdateStatus: 'Successful',
  LastUpdateStatusReason: null,
  LastUpdateStatusReasonCode: null
}

 */

async function getFunctionVersions (fn, options) {
  return new Promise((resolve, reject) => {
    const params = Object.assign({}, options, {FunctionName: fn});
    lambda.listVersionsByFunction(params, function (err, data) {
      if (err) {
        reject(err);
      } else {
        resolve(data);
      }
    })
  })
    .then(r => r)
    .catch(e => e);
}

async function publishFunctionVersion (fn, options) {
  return new Promise((resolve, reject) => {
    const params = Object.assign({}, options, {FunctionName: fn});
    lambda.publishVersion(params, function (err, data) {
      if (err) {
        reject(err);
      } else {
        resolve(data);
      }
    })
  })
    .then(r => r)
    .catch(e => e);
}

//result = {
//  FunctionName: 'f2-node-bam',
//  FunctionArn: 'arn:aws:lambda:us-east-1:858939916050:function:f2-node-bam:1',
//  Runtime: 'nodejs12.x',
//  Role: 'arn:aws:iam::858939916050:role/apm-node-lambda-initial',
//  Handler: 'index.handler',
//  CodeSize: 1171,
//  Description: 'no description',
//  Timeout: 3,
//  MemorySize: 128,
//  LastModified: '2020-08-09T17:59:49.262+0000',
//  CodeSha256: '7jExSpe8jPTy9forSVSqfhZmdjfSxhkdIF7mRm+xUE0=',
//  Version: '1',
//  Environment: {
//    Variables: {
//      APPOPTICS_SERVICE_NAME: 'node-bam-f2',
//      APPOPTICS_SAMPLE_PERCENT: '100',
//      APPOPTICS_LOG_SETTINGS: 'error,warn,patching,debug,span',
//      AO_TRACE: 'true'
//    }
//  },
//  KMSKeyArn: null,
//  TracingConfig: {Mode: 'Active'},
//  MasterArn: null,
//  RevisionId: '1af8b9f5-6047-49c4-bf6d-9f80823d6823',
//  Layers: [
//    {
//      Arn: 'arn:aws:lambda:us-east-1:858939916050:layer:appoptics-apm-layer:8',
//      CodeSize: 13423440
//    }
//  ],
//  State: 'Active',
//  StateReason: null,
//  StateReasonCode: null,
//  LastUpdateStatus: 'Successful',
//  LastUpdateStatusReason: null,
//  LastUpdateStatusReasonCode: null
//}

async function updateFunctionCode (fn, options) {
  return new Promise((resolve, reject) => {
    const params = Object.assign({}, options, {FunctionName: fn});
    lambda.updateFunctionCode(params, function (err, data) {
      if (err) {
        reject(err);
      } else {
        resolve(data);
      }
    })
  })
    .then(r => r)
    .catch(e => e);
}

async function listLayerVersions (layer, options) {
  return new Promise((resolve, reject) => {
    const params = Object.assign({}, options, {LayerName: layer});
    lambda.listLayerVersions(params, function (err, data) {
      if (err) {
        reject(err);
      } else {
        resolve(data);
      }
    })
  })
    .then(r => r)
    .catch(e => e);
}

async function getLayerVersion (layer, version) {
  return new Promise((resolve, reject) => {
    const params = {LayerName: layer, VersionNumber: version};
    lambda.getLayerVersion(params, function (err, data) {
      if (err) {
        reject(err);
      } else {
        resolve(data);
      }
    })
  })
    .then(r => r)
    .catch(e => e);
}

async function getLayerVersionByArn (arn) {
  return new Promise((resolve, reject) => {
    const params = {Arn: arn};
    lambda.getLayerVersionByArn(params, function (error, data) {
      if (error) {
        reject(error);
      } else {
        resolve(data);
      }
    })
  })
    .then(r => r)
    .catch(e => e);
}

/**
node aws-api-survey.js --get-layer-version 'appoptics-apm-layer' --layer-version 31
GET-LAYER-VERSION {
  Content: {
    Location: 'https://prod-04-2014-layers.s3.us-east-1.amazonaws.com/snapshots/858939916050/appoptics-apm-layer-476bc312-ce50-43e6-a772-4a7c0b4ccf47?versionId=TbT6IVz6gVBHVKNvFCN8LmW0dAnzpirT&X-Amz-Security-Token=IQoJb3JpZ2luX2VjECYaCXVzLWVhc3QtMSJHMEUCIBfKg4NnPgOWnWcs8l15%2FsrFtUrFbsvVw93DjwyyOVMbAiEAs58tAKKHrwGbeMdVXVpLxcb2hOKjkxSao8ivzY9SuOoqtAMIHxAAGgw3NDk2Nzg5MDI4MzkiDEXNuqQq5puLiP0jXSqRA1iuBRRmuyHAD7g8R6v7lSOeaBU8fs%2BpyD41BBpW4eBFbN2Sbs3hnwPfHyvzcjAzo9pwdI7TaO8LSpsGdauRGO7rf74SsW7O4zb9gKM2NhqAsv4T8ycr0edDJHmA9vjQ%2BIbv2w2fBPQRQiPd0fHQCB%2B4a7vZeHUh011kIvo6C4gUi1cBF%2FczHESIijM1k6h4vtbkCnxYtDT4tIeEXECeiuZEHgE%2B28GCFTdDZ8Oh0zNJpCysZsZlI8YSAP9CUHWc9d5mLRtrcH5uI1c43xgZIJjebPBe2R%2Fi%2FI%2FytznjB5AJKgeJeKFObzs2QZsvvCakRHqQcbj%2FJv9wtWwGAx5i35sW3sJgvVNYHm5to2p3H7aWp33drgR%2B%2BmJCazB%2B2n2KlM09jfKbS9oTfI0SScAc2lS78n%2BZpsZXkZ1QTdw5%2FJINsa0m7IkbAeuo0Jcp%2FTAjM9NekX6A6IvXD8O%2FLR76RI6F1DexeQ16MKhi7Kjl%2FpEhHG1a6mfsUwqqj2neQi6bdvmIjEY9BBDjK34WoLUtITUlMJP3pfoFOusBR89DDsawDPLUErT2J7t4FJkF2xVc4SzhX8Rydy63nhs1ACrjzxH6KyHbKseEEC1bdwgldgljkAI%2BBYa3RARKItOaTO1A4ePR5YJnRBzIhD%2BKV52lskfqHnpM1XN4kq9jP1DtUEi3xdpJteZ12SzORcITcJ1Q9OWJ2Ay7wHgVBQaPTiWjhrejG6fLLInWU7%2FJCOKe3%2By8rDCn%2Bzk6l8YWZ%2BETZrtelJ2qgEyePYMGG3Yrm0x3xkccKgbxMbx%2FBIWYLgARDPdKGe1py6pbGlL7rLXifaIg6V1Dvcp9grirCUwfoC43CRvmc4a8gQ%3D%3D&X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Date=20200828T221106Z&X-Amz-SignedHeaders=host&X-Amz-Expires=600&X-Amz-Credential=ASIA25DCYHY3ZTMYDO6H%2F20200828%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Signature=12ce9118baa27866d996ffcf825d3eef63d0fb624d89e4025dafb3f42656210f',
    CodeSha256: 'DGiN190zfHZBqoqABy7L5MZZ3rmJMEt/WS2LZZWnNiA=',
    CodeSize: 10833754
  },
  LayerArn: 'arn:aws:lambda:us-east-1:858939916050:layer:appoptics-apm-layer',
  LayerVersionArn: 'arn:aws:lambda:us-east-1:858939916050:layer:appoptics-apm-layer:31',
  Description: 'apm v8.1.0-lambda-05, bindings v10.0.0-lambda-2',
  CreatedDate: '2020-08-28T17:47:19.364+0000',
  Version: 31,
  CompatibleRuntimes: [ 'nodejs10.x', 'nodejs12.x' ],
  LicenseInfo: 'ISC'
}

 */


//
//
// https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/CloudWatchLogs.html#getLogEvents-property
// useful options
//   limit: number of items to return
//   nextToken: string
//   startFromHead:
//
async function getLogEvents (logGroupName, logStreamName, options) {
  return new Promise((resolve, reject) => {
    const params = {logGroupName, logStreamName, startFromHead: true};
    Object.assign(params, options);
    cwl.getLogEvents(params, function (err, data) {
      if (err) {
        reject(err);
      } else {
        resolve(data);
      }
    })
  })
    .then(r => r)
    .catch(e => e);
}

//
//
//
async function invoke (FunctionName, Payload) {
  const params = {FunctionName, Payload};
  return lambda.invoke(params).promise()
    .then(r => {
      const payload = JSON.parse(r.Payload);
      if (typeof payload.body === 'string' && payload.body[0] === '{') {
        payload.body = JSON.parse(payload.body);
      }
      r.Payload = payload;
      return r;
    })
    .catch(e => {
      return e;
    });
}


module.exports = {
  AWS,
  lambda,
  cwl,
  getFunctionInfo,
  getFunctionConfiguration,
  getFunctionVersions,
  publishFunctionVersion,
  updateFunctionCode,
  listLayerVersions,
  getLayerVersion,
  getLayerVersionByArn,
  getLogEvents,
  invoke,
}


//======================================================================================
//======================================================================================
// main/test
//======================================================================================
//======================================================================================
if (module.__parent__ === undefined) {
  /* eslint-disable no-console */
  const minimist = require('minimist');
  const options = {
    default: {
      description: 'no description',
    },
    alias: {
      function: 'f',
      verbose: 'v',
      description: 'd',
    },
    boolean: [
      'examine',
      'create',
      'verbose',
      'publish-new-version',
      'update-function-code',
      'dry-run',
      'force'
    ],

  }
  const args = minimist(process.argv, options);
  const verbose = args.verbose;

  if (args.examine) {
    console.log(args);
    process.exit();
  }
  const fn = args.function;

  async function main () {

    //
    // things requiring a function name
    //
    if (fn) {
      // does the function exist?
      const fnInfo = await getFunctionInfo(fn);
      if (fnInfo instanceof Error) {
        if (fnInfo.code === 'ResourceNotFoundException') {
          console.log(fn, 'not found, specify --create to create it');
        } else {
          console.log(fnInfo);
          process.exit(1);
        }
      }
      if (verbose) console.log('FUNCTION INFO', fnInfo);


      // get the versions of the function
      const vInfo = await getFunctionVersions(fn);
      if (vInfo instanceof Error) {
        console.log(vInfo);
        process.exit(1);
      }
      if (verbose) console.log('FUNCTION VERSIONS', vInfo);

      const fConfig = await getFunctionConfiguration(fn);
      if (fConfig instanceof Error) {
        console.log(fConfig);
        process.exit(1);
      }
      if (verbose || true) console.log('FUNCTION CONFIGURATION', fConfig);


      if (args['publish-new-version']) {
        // use options to make sure we're updating the version we think we
        // are. it's almost always going to be the case in this little program
        // but it means that we should probably record this information somewhere
        // and supply it to make sure we don't publish an unintended version. or
        // always publish when modifying the function.
        //
        // most likely an alias can be used to tie the published version to a specific
        // agent version. the description is another option but the alias seems more
        // appropriate.
        const options = {
          FunctionName: fn,
          RevisionId: vInfo.RevisionId,
          Description: args.description,
          CodeSha256: vInfo.CodeSha256,
        };
        const publishStatus = await publishFunctionVersion(fn, options);

        console.log(publishStatus);
      }

      //
      // this updates $LATEST
      //
      if (args['update-function-code']) {
        const zipFile = 'function.zip';
        const zStats = await getFileStats(zipFile);
        const fStats = await getFileStats('index.js');
        if (zStats instanceof Error) zStats.mTimeMs = 0;
        if (fStats instanceof Error) {
          console.log(fStats.message);
          process.exit(1);
        }
        if (fStats.mtimeMs > zStats.mtimeMs && !args.force) {
          console.log(`${zipFile} is newer than index.js; use --force to force this`);
          process.exit(1);
        } else if (fStats.mtimeMs > zStats.mtimeMs) {
          const {error, stdout, stderr} = await execCommandLine('zip -q function.zip index.js');
          if (error) {
            console.log(error);
            process.exit(1);
          }
          console.log('stdout', stdout);
          console.log('stderr', stderr);
        }
        //var params = {
        //  FunctionName: 'STRING_VALUE', /* required */
        //  DryRun: true || false,
        //  Publish: true || false,
        //  RevisionId: 'STRING_VALUE',
        //  S3Bucket: 'STRING_VALUE',
        //  S3Key: 'STRING_VALUE',
        //  S3ObjectVersion: 'STRING_VALUE',
        //  ZipFile: Buffer.from('...') || 'STRING_VALUE' /* Strings will be Base-64 encoded on your behalf */
        //};
        const params = {
          FunctionName: fn,               // TODO BAM this is redundant, rethink.
          RevisionId: vInfo.RevisionId,
          DryRun: args['dry-run'],
          Publish: false,
          //  S3Bucket: 'STRING_VALUE',
          //  S3Key: 'STRING_VALUE',
          //  S3ObjectVersion: 'STRING_VALUE',
          ZipFile: await readFile(zipFile),
        }

        const r = await updateFunctionCode(fn, params);
        console.log('UPDATE-FUNCTION-CODE', r);

      }
    }

    //
    // things fiddling with layers
    //
    if (args['list-layer-versions']) {
      const params = {};

      const versions = await listLayerVersions(args['list-layer-versions'], params);
      console.log('LIST-LAYER-VERSIONS', versions);
    }

    if (args['get-layer-version']) {
      if (!args['layer-version']) {
        console.log('get-layer-version requires --layer-version N argument');
        process.exit(1);
      }

      const version = await getLayerVersion(args['get-layer-version'], args['layer-version']);
      console.log('GET-LAYER-VERSION', version);
    }

    // https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-lambda-alias.html
    // alias points to function:version
    //   function function-name | function ARN | partial ARN
    //   version (\$LATEST|[0-9]+)
    // alias name (?!^[0-9]+$)([a-zA-Z0-9-_]+)
    // createAlias
    // deleteAlias
    // updateAlias

    // deleteLayerVersion
    // getLayerVersion
    // getLayerVersionByArn
    // getLayerVersionPolicy
    // listLayers
    // listLayerVersions
    // publishLayerVersion
    // removeLayerVersionPermission


  }

  main();

}


//
// create or update the function in function.zip
//
//if [ "$1" = "create" ]; then
//  aws lambda create-function --function-name f2-node-bam \
//      --zip-file fileb://function.zip \
//      --handler index.handler \
//      --runtime nodejs12.x \
//      --role arn:aws:iam::858939916050:role/apm-node-lambda-initial
//  exit $?
//fi

//if [ "index.js" -nt "function.zip" ]; then
//    if [ -z "$force" ]; then
//        echo "index.js is newer than function.zip; touch function.zip and retry"
//        echo "if that is what you really mean to do. or define non-empty force"
//        echo "for this script to zip function.js"
//        exit 1
//    else
//        zip function.zip index.js
//    fi
//fi

//aws lambda update-function-code --function-name f2-node-bam \
//    --zip-file fileb://function.zip
//exit $?

//# example output
//x='
// {
//    "FunctionName": "f2-node-bam",
//    "FunctionArn": "arn:aws:lambda:us-east-1:858939916050:function:f2-node-bam",
//    "Runtime": "nodejs12.x",
//    "Role": "arn:aws:iam::858939916050:role/apm-node-lambda-initial",
//    "Handler": "index.handler",
//    "CodeSize": 238,
//    "Description": "",
//    "Timeout": 3,
//    "MemorySize": 128,
//    "LastModified": "2020-07-31T15:45:03.165+0000",
//    "CodeSha256": "9ZxeudioT6eXvhIfxEOZAEJGOQCBposiDhGtH9afN78=",
//    "Version": "$LATEST",
//    "TracingConfig": {
//        "Mode": "PassThrough"
//    },
//    "RevisionId": "399251a6-3174-4e87-8c09-fdeeb0e91b28",
//    "State": "Active",
//    "LastUpdateStatus": "Successful"
//}
//'
