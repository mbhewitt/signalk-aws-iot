const awsIot = require('aws-iot-device-sdk');

module.exports = (app) => {
  const plugin = {};
  let device;
  let unsubscribes = [];
  let state = 'default';
  let connected = false;
  const setStatus = app.setPluginStatus || app.setProviderStatus;
  const setError = app.setPluginError || app.setProviderError;

  plugin.id = 'signalk-aws-iot2';
  plugin.name = 'SignalK AWS IoT2';
  plugin.description = 'Plugin that sends data to AWS IoT Core';

  function isPublishState(options) {
    const sendStates = options.send_states || [];
    if (sendStates.indexOf(state) === -1) {
      return false;
    }
    return true;
  }

  function setState(newState, options) {
    if (newState === state) {
      return;
    }
    state = newState;
    if (!connected) {
      // Since we're offline we get better provider state messages
      // via connection handling
      return;
    }
    if (isPublishState(options)) {
      setStatus('Connected to AWS IoT Core and sending data');
    } else {
      setStatus(`Connected to AWS IoT Core. Not sending data due to "${state}" state`);
    }
  }

  function sendValue(v, options) {
    if (v.path === 'navigation.state') {
      setState(v.value, options);
    } else if (!isPublishState(options)) {
      // Not in a state where we want to send stuff
      return;
    }
    const topic = v.path.replace(/\./g, '/');
    app.debug(`PUB ${topic} ${JSON.stringify(v.value)}`);
    device.publish(topic, JSON.stringify(v.value));
  }

  
  plugin.start = (options) => {
    a=0;
    flatten={};
    flatten.epoch=Date.now();
    // Here we put our plugin logic
    app.debug('Plugin started');
    setStatus('Initializing');

    device = awsIot.device({
      host: options.aws_host,
      clientId: options.aws_client_id,
      privateKey: Buffer.from(options.aws_key || '', 'utf8'),
      clientCert: Buffer.from(options.aws_cert || '', 'utf8'),
      caCert: Buffer.from(options.aws_ca || '', 'utf8'),
   });
//    app.debug(`DEBUG AWS ${JSON.stringify(device)}`);

    const localSubscription = {
      context: 'vessels.self',
      subscribe: [{
        path: '*',
        period: (options.send_interval || 10) * 1000,
      }],
    };

    app.subscriptionmanager.subscribe(
      localSubscription,
      unsubscribes,
      (subscriptionError) => {
        app.error(subscriptionError);
      },
      (delta) => {
        t1=Date.now();
        if(options.single_message&&t1-flatten.epoch>=options.send_interval*1000){
           a=a+1;
           var v={path: "signalk",value: flatten};
//           app.debug(`DEBUG ${a} ${JSON.stringify(v)}`);
           sendValue(v, options);
           flatten.epoch=t1;
        }
        if (!delta.updates) {
          return;
        }
        flatten.context=delta.context;
        delta.updates.forEach((u) => {
          if (!u.values) {
            return;
          }
          flatten.timestamp=u.timestamp;
          u.values.forEach((v) => {
             path=v.path;
             if(path!=""){
                flatten[path]=v.value;
             } else {
                app.debug(`DEBUG Missing ${a} ${JSON.stringify(delta)}`);
             }
             if(!options.single_message){
                sendValue(v, options);
             }
          });
        });
      },
    );

    device
      .on('connect', () => {
        setStatus('Connected to AWS IoT Core');
        connected = true;
      });
    device
      .on('reconnect', () => {
        setStatus('Reconnecting to AWS IoT Core');
      });
    device
      .on('offline', () => {
        setStatus('Offline');
        connected = false;
      });
    device
      .on('close', () => {
        setStatus('Connection closed');
        connected = false;
      });
    device
      .on('error', (error) => {
        app.error(error);
        setError(error.message);
      });
  };

  plugin.stop = () => {
    unsubscribes.forEach((f) => f());
    unsubscribes = [];
    if (device) {
      device.end(true);
    }
    app.debug('Plugin stopped');
  };

  plugin.schema = {
    type: 'object',
    required: [
      'aws_host',
      'aws_client_id',
      'aws_key',
      'aws_cert',
    ],
    properties: {
      aws_host: {
        type: 'string',
        format: 'hostname',
        title: 'AWS IoT endpoint hostname',
      },
      aws_client_id: {
        type: 'string',
        title: 'AWS IoT client ID (must match Thing name)',
      },
      aws_key: {
        type: 'string',
        title: 'AWS IoT device private key',
      },
      aws_cert: {
        type: 'string',
        title: 'AWS IoT device certificate',
      },
      aws_ca: {
        type: 'string',
        title: 'AWS IoT certificate authority',
        default: `-----BEGIN CERTIFICATE-----
MIIDQTCCAimgAwIBAgITBmyfz5m/jAo54vB4ikPmljZbyjANBgkqhkiG9w0BAQsF
ADA5MQswCQYDVQQGEwJVUzEPMA0GA1UEChMGQW1hem9uMRkwFwYDVQQDExBBbWF6
b24gUm9vdCBDQSAxMB4XDTE1MDUyNjAwMDAwMFoXDTM4MDExNzAwMDAwMFowOTEL
MAkGA1UEBhMCVVMxDzANBgNVBAoTBkFtYXpvbjEZMBcGA1UEAxMQQW1hem9uIFJv
b3QgQ0EgMTCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBALJ4gHHKeNXj
ca9HgFB0fW7Y14h29Jlo91ghYPl0hAEvrAIthtOgQ3pOsqTQNroBvo3bSMgHFzZM
9O6II8c+6zf1tRn4SWiw3te5djgdYZ6k/oI2peVKVuRF4fn9tBb6dNqcmzU5L/qw
IFAGbHrQgLKm+a/sRxmPUDgH3KKHOVj4utWp+UhnMJbulHheb4mjUcAwhmahRWa6
VOujw5H5SNz/0egwLX0tdHA114gk957EWW67c4cX8jJGKLhD+rcdqsq08p8kDi1L
93FcXmn/6pUCyziKrlA4b9v7LWIbxcceVOF34GfID5yHI9Y/QCB/IIDEgEw+OyQm
jgSubJrIqg0CAwEAAaNCMEAwDwYDVR0TAQH/BAUwAwEB/zAOBgNVHQ8BAf8EBAMC
AYYwHQYDVR0OBBYEFIQYzIU07LwMlJQuCFmcx7IQTgoIMA0GCSqGSIb3DQEBCwUA
A4IBAQCY8jdaQZChGsV2USggNiMOruYou6r4lK5IpDB/G/wkjUu0yKGX9rbxenDI
U5PMCCjjmCXPI6T53iHTfIUJrU6adTrCC2qJeHZERxhlbI1Bjjt/msv0tadQ1wUs
N+gDS63pYaACbvXy8MWy7Vu33PqUXHeeE6V/Uq2V8viTO96LXFvKWlJbYK8U90vv
o/ufQJVtMVT8QtPHRh8jrdkPSHCa2XV4cdFyQzR1bldZwgJcJmApzyMZFo6IQ6XU
5MsI+yMRQ+hDKXJioaldXgjUkK642M4UwtBV8ob2xJNDd2ZhwLnoQdeXeGADbkpy
rqXRfboQnoZsG4q5WTP468SQvvG5
-----END CERTIFICATE-----`,
      },
      send_states: {
        type: 'array',
        title: 'Send data to AWS IoT when vessel is in the following states',
        items: {
          type: 'string',
          enum: [
            'default',
            'not under command',
            'anchored',
            'moored',
            'sailing',
            'motoring',
            'towing < 200m',
            'towing > 200m',
            'pushing',
            'fishing',
            'fishing-hampered',
            'trawling',
            'trawling-shooting',
            'trawling-hauling',
            'pilotage',
            'not-under-way',
            'aground',
            'restricted manouverability',
            'restricted manouverability towing < 200m',
            'restricted manouverability towing > 200m',
            'restricted manouverability underwater operations',
            'constrained by draft',
            'mine clearance',
          ],
        },
        default: [
          'default',
          'sailing',
          'motoring',
          'anchored',
        ],
        uniqueItems: true,
      },
      send_interval: {
        type: 'number',
        title: 'How often to send data, in seconds',
        default: 10,
      },
      single_message: {
        type: 'boolean',
        title: 'Publish state including all updates in the past (send_interval) as a single message',
        default: false,
      },
    },
  };
  plugin.uiSchema = {
    aws_key: {
      'ui:widget': 'textarea',
    },
    aws_cert: {
      'ui:widget': 'textarea',
    },
    aws_ca: {
      'ui:widget': 'textarea',
    },
    send_states: {
      'ui:widget': 'checkboxes',
    },
  };

  return plugin;
};
