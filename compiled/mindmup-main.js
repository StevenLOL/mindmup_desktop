    /*global document, window, MM */
    var _gaq = _gaq || [],
      scriptError = function (err) {
        var d=document.createElement("div"),
            c=document.createElement('div'),
            tryToNotifyGoogleAnalytics=function(){
              _gaq.push(['_setAccount', 'UA-37452180-3']);
              _gaq.push(['_trackEvent','Error','Script Load', err && err.message]);
              (function() {
                var ga = document.createElement('script'); ga.type = 'text/javascript'; ga.async = true;
                ga.src = ('https:' == document.location.protocol ? 'https://ssl' : 'http://www') + '.google-analytics.com/ga.js';
                var s = document.getElementsByTagName('script')[0]; s.parentNode.insertBefore(ga, s);
              })();
            };

        d.appendChild(document.createTextNode("Unfortunately, there was an error while loading the JavaScript files required by this page."+
          " This might be due to a temporary network issue or a firewall blocking access to required scripts. "+
          " Please try again later. " +
          " If the problem persists, we'd appreciate if you could contact us at contact@mindmup.com"));
        d.style.position='absolute'; d.style.top='30%'; d.style.left='40%'; d.style.width='20%'; d.style.backgroundColor='#773333'; d.style.color='white'; d.style.fontWeight='bold'; d.style.padding='20px'; d.style.border='3px solid black';
        c.style.position='absolute'; c.style.top=0; c.style.left=0; c.style.width='100%'; c.style.height='100%'; c.style.minHeight='100%'; c.style.backgroundColor='#999999';
        c.appendChild(d);
        document.getElementsByTagName("body")[0].appendChild(c);
        tryToNotifyGoogleAnalytics();
      };
    window.mmtimestamp.log('script init');
    window.onload = function () {
      window.mmtimestamp.log('remote scripts loaded');
      try {
        MM.main({
          googleAnalyticsAccount: 'UA-37452180-3',
          s3Url: 'https://mindmup.s3.amazonaws.com/',
          s3Folder: 'test/',
          googleClientId: '693114381294.apps.googleusercontent.com',
          googleApiKey: '',
          googleAppId: '',
          publishingConfigUrl: 'http://localhost:5000/publishingConfig',
          baseUrl: 'http://localhost:5000/',
          scriptsToLoadAsynchronously: '',
          networkTimeoutMillis: 60000,
          userCohort: 'chrome-app',
          dropboxAppKey: '',
          corsProxyUrl: '',
          goldApiUrl: 'https://gold.mindmup.com',
          goldBucketName: 'mindmup-gold',
          publicUrl: 'compiled',
          layout: 'dom'
        });
       } catch (e) {
        scriptError(e);
        console.log(e);
      }
    }
