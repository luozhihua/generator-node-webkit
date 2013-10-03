'use strict';
var util = require('util');
var path = require('path');
var yeoman = require('yeoman-generator');
var when = require('when');
var https = require('https');
var fs = require('fs-extra');
var AdmZip = require('adm-zip');
var url = require('url');
var GitHubApi = require('github');

var proxy = process.env.http_proxy || process.env.HTTP_PROXY || process.env.https_proxy || process.env.HTTPS_PROXY || null;
var githubOptions = {
  version: '3.0.0'
};

if (proxy) {
  githubOptions.proxy = {};
  githubOptions.proxy.host = url.parse(proxy).hostname;
  githubOptions.proxy.port = url.parse(proxy).port;
}

var github = new GitHubApi(githubOptions);

var suggestAppNameFromPath = function (_) {
  var basePath = path.basename(process.env.PWD);
  return _.slugify(basePath);
};

var NodeWebkitGenerator = module.exports = function NodeWebkitGenerator(args, options, config) {
  yeoman.generators.Base.apply(this, arguments);

  this.on('end', function () {
    this.installDependencies({ skipInstall: options['skip-install'] });
  });

  this.pkg = JSON.parse(this.readFileAsString(path.join(__dirname, '../package.json')));
  this.nodeWebkitBaseUrl = 'https://s3.amazonaws.com/node-webkit/v0.7.5/node-webkit-v0.7.5-';
};

util.inherits(NodeWebkitGenerator, yeoman.generators.Base);

NodeWebkitGenerator.prototype.askFor = function askFor() {
  var done = this.async();
  var appName = suggestAppNameFromPath(this._);

  // have Yeoman greet the user.
  console.log(this.yeoman);

  var prompts = [
    {
      name: 'appName',
      message: 'What do you want to call your app?',
      default: appName
    },
    {
      name: 'appDescription',
      message: 'A little description for your app?'
    },
    {
      name: 'githubUser',
      message: 'Would you mind telling me your username on GitHub?',
      default: 'someuser'
    },
    {
      type: 'checkbox',
      name: 'platforms',
      message: 'Which platform do you wanna support?',
      choices: [
        {
          name: 'MacOS',
          checked: true
        },
        {
          name: 'Linux 64',
          checked: true
        },
        {
          name: 'Windows',
          checked: true
        },
        {
          name: 'Linux 32'
        },
      ],
      validate: function( answer ) {
        if ( answer.length < 1 ) {
          return "You must choose at least one platform.";
        }
        return true;
      }
    }
  ];

  this.prompt(prompts, function (props) {
    var _this = this;
    this.appName = props.appName;
    this.appDescription = props.appDescription;
    this.platforms = props.platforms;
    this.githubUser = props.githubUser;
    this.MacOS = false;
    this.Linux32 = false;
    this.Linux64 = false;
    this.Windows = false;
    this.github = false;

    props.platforms.forEach(function(platform){
      switch(platform){
        case 'MacOS':
          _this.MacOS = true;
          break;
        case 'Linux 32':
          _this.Linux32 = true;
          break;
        case 'Linux 64':
          _this.Linux64 = true;
          break;
        case 'Windows':
          _this.Windows = true;
          break;
      }
    });

    done();
  }.bind(this));
};

NodeWebkitGenerator.prototype.userInfo = function userInfo() {
  var done = this.async();
  var _this = this;
  var responseClbk = function (err, responseText) {
    if (err) {
      _this.log.conflict(err);
      throw err;
    } else {
      var responseObject = JSON.parse(JSON.stringify(responseText));
      _this.log.ok('Github informations successfully retrieved.');
      _this.realname = responseObject.name;
      _this.email = responseObject.email;
      _this.githubUrl = responseObject.html_url;
      done();
    }
  };

  if(this.githubUser !== 'someuser'){
    this.log.info('Get GitHub informations');
    this.github = true;
    github.user.getFrom({ user: this.githubUser }, responseClbk);
  } else {
    done();
  }
};

NodeWebkitGenerator.prototype.app = function app() {
  this.mkdir('app');
  this.mkdir('app/img');
  this.mkdir('resources/node-webkit');
  if(this.MacOS){
    this.mkdir('resources/node-webkit/mac');
  }
  if(this.Linux32){
    this.mkdir('resources/node-webkit/linux32');
  }
  if(this.Linux64){
    this.mkdir('resources/node-webkit/linux64');
  }
  if(this.Windows){
    this.mkdir('resources/node-webkit/win');
  }
  this.mkdir('tmp');
};

NodeWebkitGenerator.prototype.getNodeWebkit = function getNodeWebkit(){
  var done = this.async();
  var whenClbk = function(){
    done();
  };
  if(this.platforms.length > 0){
    when.all(this._getNodeWebkit(), whenClbk, whenClbk);
  } else {
    done();
  }
};


NodeWebkitGenerator.prototype._getNodeWebkit = function _getNodeWebkit(){
  var promises = [];
  if(this.MacOS){
    promises.push(this._requestNodeWebkit('osx-ia32.zip', 'MacOS'));
  }
  if(this.Linux32){
    promises.push(this._requestNodeWebkit('linux-ia32.tar.gz', 'Linux32'));
  }
  if(this.Linux64){
    promises.push(this._requestNodeWebkit('linux-x64.tar.gz', 'Linux64'));
  }
  if(this.Windows){
    promises.push(this._requestNodeWebkit('win-ia32.zip', 'Windows'));
  }
  return promises;
};

NodeWebkitGenerator.prototype._requestNodeWebkit = function _requestNodeWebkit(versionString, platform){
  var defer = when.defer(),
    _this = this;
  if (!fs.existsSync('tmp/node-webkit-'+ versionString)) {
    this.log.info('Downloading node-webkit for ' + platform);
    https.get(this.nodeWebkitBaseUrl + versionString, function (res) {
      if(res.headers['content-type'] === 'application/zip'){
        res.on('data', function (chunk) {
          fs.appendFileSync('tmp/node-webkit-'+ versionString, chunk);
        }).on('end', function () {
            _this.log.ok('Node-webkit for ' + platform + ' downloaded');
            _this._unzipNodeWebkit(platform);
            defer.resolve();
        }).on('error', function(error){
            _this.log.conflict('Error while downloading node-webkit for ' + platform, error);
            defer.reject(error);
        });
      } else {
        _this.log.conflict('Wrong content type for %s', platform);
        defer.reject();
      }
    }).on('error', function(error){
        _this.log.conflict('Error while downloading node-webkit for ' + platform, error);
        defer.reject();
    });
  } else{
    this.log.ok('Node-webkit for ' + platform + ' already downloaded');
    defer.resolve();
  }
  return defer.promise;
};

NodeWebkitGenerator.prototype._unzipNodeWebkit = function _unzipNodeWebkit(platform){
  this.log.info('Unzip %s files.', platform);
  switch (platform) {
    case 'MacOS':
      var zipMac = new AdmZip('tmp/node-webkit-osx-ia32.zip');
      zipMac.extractAllTo('tmp/mac', true);
      this._copyNodeWebkit(platform);
      break;
    case 'Linux32':
      //TODO tar.gz
      break;
    case 'Linux64':
      //TODO tar.gz
      break;
    case 'Windows':
      var zipWin = new AdmZip('tmp/node-webkit-win-ia32.zip');
      zipWin.extractAllTo('resources/node-webkit/win', true);
      break;
  }
};

NodeWebkitGenerator.prototype._copyNodeWebkit = function _copyNodeWebkit(platform) {
  var _this = this;
  this.log.info('Copy %s files.', platform);
  switch(platform){
    case 'MacOS':
      fs.copy('tmp/mac/node-webkit.app', 'resources/node-webkit/mac/node-webkit.app', function (error) {
        if (error) {
          _this.log.conflict('Error while copying files for '+ platform +'!', error);
        } else {
          _this.log.ok('%s files successfully copied.', platform);
//          _this._cleanUp(platform);
        }
      });
      break;
    default:
      this.log.ok('No files to copy');
  }
};

NodeWebkitGenerator.prototype._cleanUp = function _cleanUp(platform) {
  var _this = this;
  this.log.info('Cleaning up tmp directories for %s.', platform);
  switch(platform){
    case 'MacOS':
      fs.remove('tmp/mac', function(error){
        if(error){
          _this.log.conflict('Error while deleting tmp directory for '+ platform +'!', error);
        } else {
          _this.log.ok('Tmp directory for %s successfully removed.', platform);
        }
      });
      fs.remove('tmp/node-webkit-osx-ia32.zip', function(error){
        if(error){
          _this.log.conflict('Error while deleting zip file for '+ platform +'!', error);
        } else {
          _this.log.ok('Zip file for %s successfully removed.', platform);
        }
      });
      break;
    default:
      this.log.ok('No files to copy');
  }
};

NodeWebkitGenerator.prototype.projectfiles = function projectfiles() {
  this.copy('editorconfig', '.editorconfig');
  this.copy('jshintrc', '.jshintrc');
};

NodeWebkitGenerator.prototype.copyFiles = function copyFiles() {
  this.copy('_bower.json', 'bower.json');
  this.copy('app/_main.css', 'app/css/main.css');
  this.copy('app/_index.js', 'app/js/index.js');
  this.template('_package.json', 'package.json');
  this.template('app/_package.json', 'app/package.json');
  this.template('app/_index.html', 'app/views/index.html');
  this.template('_Gruntfile.js', 'Gruntfile.js');
  this.template('mac-files/_Info.plist.tmp', 'resources/mac-files/Info.plist.tmp');
  this.template('mac-files/_Info.plist', 'resources/mac-files/Info.plist');
};

