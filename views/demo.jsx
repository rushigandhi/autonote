import React from 'react';
import Dropzone from 'react-dropzone';
import { Icon, Tabs, Pane, Alert } from 'watson-react-components';
import recognizeMicrophone from 'watson-speech/speech-to-text/recognize-microphone';
import recognizeFile from 'watson-speech/speech-to-text/recognize-file';
import ModelDropdown from './model-dropdown.jsx';
import Transcript from './transcript.jsx';
import { Keywords, getKeywordsSummary } from './keywords.jsx';
import SpeakersView from './speaker.jsx';
//import TimingView from './timing.jsx';
//import JSONView from './json-view.jsx';
import samples from '../src/data/samples.json';
import cachedModels from '../src/data/models.json';
const ERR_MIC_NARROWBAND = 'Microphone transcription cannot accommodate narrowband voice models, please select a broadband one.';

import Summary from './summary.jsx';

export default React.createClass({
  displayName: 'Demo',

  getInitialState() {
    return {
      model: 'en-US_BroadbandModel',
      rawMessages: [],
      formattedMessages: [],
      audioSource: null,
      speakerLabels: true,
      keywords: this.getKeywords('en-US_BroadbandModel'),
      settingsAtStreamStart: {
        model: '',
        keywords: [],
        speakerLabels: false,
      },
      error: null,
    };
  },

  reset() {
    if (this.state.audioSource) {
      this.stopTranscription();
    }
    this.setState({ rawMessages: [], formattedMessages: [], error: null });
  },

  /**
     * The behavior of several of the views depends on the settings when the
     * transcription was started. So, this stores those values in a settingsAtStreamStart object.
     */
  captureSettings() {
    this.setState({
      settingsAtStreamStart: {
        model: this.state.model,
        keywords: this.getKeywordsArrUnique(),
        speakerLabels: this.state.speakerLabels,
      },
    });
  },

  stopTranscription() {
    if (this.stream) {
      this.stream.stop();
    }
    this.setState({ audioSource: null });
  },

  getRecognizeOptions(extra) {
    const keywords = this.getKeywordsArrUnique();
    return Object.assign({
      token: this.state.token,
      smart_formatting: true,
      format: true,
      model: this.state.model,
      objectMode: true,
      interim_results: true,
      word_alternatives_threshold: 0.01,
      keywords,
      keywords_threshold: keywords.length
        ? 0.01
        : undefined, // note: in normal usage, you'd probably set this a bit higher
      timestamps: true, // set timestamps for each word - automatically turned on by speaker_labels
      speaker_labels: this.state.speakerLabels,
      resultsBySpeaker: this.state.speakerLabels,
      speakerlessInterim: this.state.speakerLabels,
    }, extra);
  },

  isNarrowBand(model) {
    model = model || this.state.model;
    return model.indexOf('Narrowband') !== -1;
  },

  handleMicClick() {
    if (this.state.audioSource === 'mic') {
      this.stopTranscription();
      return;
    }
    this.reset();
    this.setState({ audioSource: 'mic' });
    this.handleStream(recognizeMicrophone(this.getRecognizeOptions()));
  },

  handleUploadClick() {
    if (this.state.audioSource === 'upload') {
      this.stopTranscription();
    } else {
      this.dropzone.open();
    }
  },

  handleUserFile(files) {
    const file = files[0];
    if (!file) {
      return;
    }
    this.reset();
    this.setState({ audioSource: 'upload' });
    this.playFile(file);
  },

  handleUserFileRejection() {
    this.setState({ error: 'Sorry, that file does not appear to be compatible.' });
  },
  handleSample1Click() {
    this.handleSampleClick(1);
  },
  handleSample2Click() {
    this.handleSampleClick(2);
  },

  handleSampleClick(which) {
    if (this.state.audioSource === `sample-${which}`) {
      this.stopTranscription();
    } else {
      const filename = samples[this.state.model] && samples[this.state.model][which - 1].filename;
      if (!filename) {
        this.handleError(`No sample ${which} available for model ${this.state.model}`, samples[this.state.model]);
      }
      this.reset();
      this.setState({ audioSource: `sample-${which}` });
      this.playFile(`audio/${filename}`);
    }
  },

  playFile(file) {
    this.handleStream(recognizeFile(this.getRecognizeOptions({
      file,
      play: true, // play the audio out loud
      realtime: true,
    })));
  },

  handleStream(stream) {
    console.log(stream);
    if (this.stream) {
      this.stream.stop();
      this.stream.removeAllListeners();
      this.stream.recognizeStream.removeAllListeners();
    }
    this.stream = stream;
    this.captureSettings();

    stream.on('data', this.handleFormattedMessage).on('end', this.handleTranscriptEnd).on('error', this.handleError);

    stream.recognizeStream.on('end', () => {
      if (this.state.error) {
        this.handleTranscriptEnd();
      }
    });

    stream.recognizeStream
      .on('message', (frame, json) => this.handleRawMessage({ sent: false, frame, json }))
      .on('send-json', json => this.handleRawMessage({ sent: true, json }))
      .once('send-data', () => this.handleRawMessage({
        sent: true, binary: true, data: true, // discard the binary data to avoid waisting memory
      }))
      .on('close', (code, message) => this.handleRawMessage({ close: true, code, message }));
  },

  handleRawMessage(msg) {
    this.setState({ rawMessages: this.state.rawMessages.concat(msg) });
  },

  handleFormattedMessage(msg) {
    this.setState({ formattedMessages: this.state.formattedMessages.concat(msg) });
  },

  handleTranscriptEnd() {
    this.setState({ audioSource: null });
  },

  componentDidMount() {
    this.fetchToken();
    this.setState({ tokenInterval: setInterval(this.fetchToken, 50 * 60 * 1000) });
  },

  componentWillUnmount() {
    clearInterval(this.state.tokenInterval);
  },

  fetchToken() {
    return fetch('/api/token').then((res) => {
      if (res.status !== 200) {
        throw new Error('Error retrieving auth token');
      }
      return res.text();
    })
      .then(token => this.setState({ token })).catch(this.handleError);
  },

  getKeywords(model) {
    const files = samples[model];
    return (files && files.length >= 2 && `${files[0].keywords}, ${files[1].keywords}`) || '';
  },

  handleModelChange(model) {
    this.reset();
    this.setState({ model,
      keywords: this.getKeywords(model),
      speakerLabels: this.supportsSpeakerLabels(model) });
    if (this.state.error === ERR_MIC_NARROWBAND && !this.isNarrowBand(model)) {
      this.setState({ error: null });
    }

    if (this.state.error && this.state.error.indexOf('speaker_labels is not a supported feature for model') === 0) {
      this.setState({ error: null });
    }
  },

  supportsSpeakerLabels(model) {
    model = model || this.state.model;
    return cachedModels.some(m => m.name === model && m.supported_features.speaker_labels);
  },

  handleSpeakerLabelsChange() {
    this.setState({
      speakerLabels: !this.state.speakerLabels,
    });
  },

  handleKeywordsChange(e) {
    this.setState({ keywords: e.target.value });
  },

  getKeywordsArr() {
    return this.state.keywords.split(',').map(k => k.trim()).filter(k => k);
  },

  getKeywordsArrUnique() {
    var arr = this.state.keywords.split(',').map(k => k.trim()).filter(k => k);
    var u = {}, a = [];
    for(var i = 0, l = arr.length; i < l; ++i){
        if(!u.hasOwnProperty(arr[i])) {
            a.push(arr[i]);
            u[arr[i]] = 1;
        }
    }
    return a;
  },

  getFinalResults() {
    return this.state.formattedMessages.filter(r => r.results &&
      r.results.length && r.results[0].final);
  },

  getCurrentInterimResult() {
    const r = this.state.formattedMessages[this.state.formattedMessages.length - 1];

    if (!r || !r.results || !r.results.length || r.results[0].final) {
      return null;
    }
    return r;
  },

  getFinalAndLatestInterimResult() {
    const final = this.getFinalResults();
    const interim = this.getCurrentInterimResult();
    if (interim) {
      final.push(interim);
    }
    return final;
  },

  handleError(err, extra) {
    console.error(err, extra);
    if (err.name === 'UNRECOGNIZED_FORMAT') {
      err = 'Unable to determine content type from file name or header; mp3, wav, flac, ogg, opus, and webm are supported. Please choose a different file.';
    } else if (err.name === 'NotSupportedError' && this.state.audioSource === 'mic') {
      err = 'This browser does not support microphone input.';
    } else if (err.message === '(\'UpsamplingNotAllowed\', 8000, 16000)') {
      err = 'Please select a narrowband voice model to transcribe 8KHz audio files.';
    } else if (err.message === 'Invalid constraint') {
      err = 'Unable to access microphone';
    }
    this.setState({ error: err.message || err });
  },

  summarizeText() {
    let raw = '';
    let length = this.state.formattedMessages.length;

    if (length == 0) return;

    for (let j = 0; j < this.state.formattedMessages[length - 1].results.length; j++) {
      raw += (this.state.formattedMessages[length - 1].results[j].alternatives[0].transcript + '.');
    }

    let allMessages = raw.split(".");

    let wordsToGtho = ["the", "and", "yeah", "okay", "ok", "I", "a", "an", "another",
                  "in", "under", "towards", "for", "nor", "but", "", " "];
    let allScores = [];

    // initiatize the array of allScores
    for (let i = 0; i < allMessages.length; i++) {
      allScores.push(0);
    }

    // split message array by spaces
    for(let i = 0; i < allMessages.length; i++){
      allMessages[i] = allMessages[i].split(" ");
    }


    for(let i = 0; i < allMessages.length; i++){
      let sentenceScore = 0;
      for(let j = 0; j < allMessages[i].length; j++){
          for(let c = 0; c < wordsToGtho.length; c++){
            if(allMessages[i][j].toLowerCase() == wordsToGtho[c]){
              sentenceScore--;
            }
          }
        }
        allScores[i] += sentenceScore;
      }

    let swaps = false;
      do {
        swaps = false;
        for (let i = 0; i < allMessages.length - 1; i++) {
          if (allScores[i] > allScores[i + 1]) {
            let temp = allScores[i + 1];
            let gay = allMessages[i + 1];
            allScores[i + 1] = allScores[i];
            allMessages[i + 1] = allMessages[i];
            allScores[i] = temp;
            allMessages[i] = gay;
            swaps = true;
          }
        }
      } while (swaps);

      let numOfSentences = Math.ceil(0.25*allMessages.length);

      let summary = [];

      for (let i = allMessages.length - 1; i >= allMessages.length - numOfSentences; i--) {
        let line = "";
        for(let j = 0; j < allMessages[i].length; j++){

          line += allMessages[i][j] + ' ';

        }
        line.replace(',', ' ');
        summary.push(line.substring(0,line.length - 1) + ".");
      }

      let res = '';

      for (var i = 0; i < summary.length; i++ )res += summary[i] + ' ';
      return res;
  },

  intersect(arr1, arr2) {

    let wordCount = 0;

  for(let i = 0; i < arr1.length; i++){
    for(let j = 0; j < arr2.length; j++){
      if(arr1[i] == arr2[j]){
        wordCount++;
      }
    }
  }

  let arr1Fraction = 1.0*wordCount/arr1.length;
  let arr2Fraction = 1.0*wordCount/arr2.length;
  if(arr1Fraction > arr2Fraction){
    arr2Fraction = arr1Fraction;
    arr1Fraction = 1 - arr1Fraction;
  }
  else if(arr1Fraction < arr2Fraction){
    arr1Fraction = arr2Fraction;
    arr2Fraction = 1 - arr2Fraction;
  }
  else{
    arr1Fraction = 0.5;
    arr2Fraction = 0.5;
  }


  return [arr1Fraction, arr2Fraction];
  },

  render() {
    const buttonsEnabled = !!this.state.token;
    const buttonClass = buttonsEnabled
      ? 'base--button'
      : 'base--button base--button_black';

    let micIconFill = '#000000';
    let micButtonClass = buttonClass;
    if (this.state.audioSource === 'mic') {
      micButtonClass += ' mic-active';
      micIconFill = '#FFFFFF';
    } else if (!recognizeMicrophone.isSupported) {
      micButtonClass += ' base--button_black';
    }

    const err = this.state.error
      ? (
        <Alert type="error" color="red">
          <p className="base--p">{this.state.error}</p>
        </Alert>
      )
      : null;

    const messages = this.getFinalAndLatestInterimResult();
    const micBullet = (typeof window !== 'undefined' && recognizeMicrophone.isSupported) ?
      <li className="base--li">Use your microphone to record audio.</li> :
      <li className="base--li base--p_light">Use your microphone to record audio. (Not supported in current browser)</li>;// eslint-disable-line

    return (
      <Dropzone
        onDropAccepted={this.handleUserFile}
        onDropRejected={this.handleUserFileRejection}
        maxSize={200 * 1024 * 1024}
        accept="audio/wav, audio/mp3, audio/mpeg, audio/l16, audio/ogg, audio/flac, .mp3, .mpeg, .wav, .ogg, .opus, .flac" // eslint-disable-line
        disableClick
        className="dropzone _container _container_large"
        activeClassName="dropzone-active"
        rejectClassName="dropzone-reject"
        ref={(node) => {
          this.dropzone = node;
        }}
      >

        <center>
          <h2 className="base--h1">auto<b>note</b></h2>
        </center>

        <div className="flex buttons">
          <button className={micButtonClass} onClick={this.handleMicClick}>
            <Icon type={this.state.audioSource === 'mic' ? 'stop' : 'microphone'} fill={micIconFill} /> Record Meeting
          </button>
        </div>

        <Tabs selected={0}>
          <Pane label="Transcript">
            {this.state.settingsAtStreamStart.speakerLabels
              ? <SpeakersView messages={messages} />
              : <Transcript messages={messages} />}
          </Pane>
          <Pane label="Summary">
            <Summary messages={this.summarizeText()} />
          </Pane>
        </Tabs>

        <div className="flex buttons">
            <button>
              <a href={`mailto:?subject=Autonote: Meeting Notes on ${(new Date()).toString()}&body=${this.summarizeText()}<br/><br/>Scribed by auto<b>note</b>.`}>
                Share
              </a>
            </button>
        </div>

      </Dropzone>
    );
  },
});
