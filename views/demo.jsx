/* eslint no-param-reassign: 0 */
import React from 'react';
import Dropzone from 'react-dropzone';
import { Icon, Tabs, Pane, Alert } from 'watson-react-components';
import recognizeMicrophone from 'watson-speech/speech-to-text/recognize-microphone';
import recognizeFile from 'watson-speech/speech-to-text/recognize-file';

import ModelDropdown from './model-dropdown.jsx';
import Transcript from './transcript.jsx';
import { Keywords, getKeywordsSummary } from './keywords.jsx';
import SpeakersView from './speaker.jsx';
import TimingView from './timing.jsx';
import JSONView from './json-view.jsx';
import samples from '../src/data/samples.json';
import cachedModels from '../src/data/models.json';
const ERR_MIC_NARROWBAND = 'Microphone transcription cannot accommodate narrowband voice models, please select a broadband one.';

let SummaryTool = require('node-summary');

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
      // this.stream.removeAllListeners();
      // this.stream.recognizeStream.removeAllListeners();
    }
    this.setState({ audioSource: null });
  },

  getRecognizeOptions(extra) {
    const keywords = this.getKeywordsArrUnique();
    return Object.assign({
      // formats phone numbers, currency, etc. (server-side)
      token: this.state.token,
      smart_formatting: true,
      format: true, // adds capitals, periods, and a few other things (client-side)
      model: this.state.model,
      objectMode: true,
      interim_results: true,
      // note: in normal usage, you'd probably set this a bit higher
      word_alternatives_threshold: 0.01,
      keywords,
      keywords_threshold: keywords.length
        ? 0.01
        : undefined, // note: in normal usage, you'd probably set this a bit higher
      timestamps: true, // set timestamps for each word - automatically turned on by speaker_labels
      // includes the speaker_labels in separate objects unless resultsBySpeaker is enabled
      speaker_labels: this.state.speakerLabels,
      // combines speaker_labels and results together into single objects,
      // making for easier transcript outputting
      resultsBySpeaker: this.state.speakerLabels,
      // allow interim results through before the speaker has been determined
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

    // The recognizeMicrophone() method is a helper method provided by the watson-speech package
    // It sets up the microphone, converts and downsamples the audio, and then transcribes it
    // over a WebSocket connection
    // It also provides a number of optional features, some of which are enabled by default:
    //  * enables object mode by default (options.objectMode)
    //  * formats results (Capitals, periods, etc.) (options.format)
    //  * outputs the text to a DOM element - not used in this demo because it doesn't play nice
    // with react (options.outputElement)
    //  * a few other things for backwards compatibility and sane defaults
    // In addition to this, it passes other service-level options along to the RecognizeStream that
    // manages the actual WebSocket connection.
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

  /**
   * @param {File|Blob|String} file - url to an audio file or a File
   * instance fro user-provided files.
   */
  playFile(file) {
    // The recognizeFile() method is a helper method provided by the watson-speach package
    // It accepts a file input and transcribes the contents over a WebSocket connection
    // It also provides a number of optional features, some of which are enabled by default:
    //  * enables object mode by default (options.objectMode)
    //  * plays the file in the browser if possible (options.play)
    //  * formats results (Capitals, periods, etc.) (options.format)
    //  * slows results down to realtime speed if received faster than realtime -
    // this causes extra interim `data` events to be emitted (options.realtime)
    //  * combines speaker_labels with results (options.resultsBySpeaker)
    //  * outputs the text to a DOM element - not used in this demo because it doesn't play
    //  nice with react (options.outputElement)
    //  * a few other things for backwards compatibility and sane defaults
    // In addition to this, it passes other service-level options along to the RecognizeStream
    // that manages the actual WebSocket connection.
    this.handleStream(recognizeFile(this.getRecognizeOptions({
      file,
      play: true, // play the audio out loud
      // use a helper stream to slow down the transcript output to match the audio speed
      realtime: true,
    })));
  },

  handleStream(stream) {
    console.log(stream);
    // cleanup old stream if appropriate
    if (this.stream) {
      this.stream.stop();
      this.stream.removeAllListeners();
      this.stream.recognizeStream.removeAllListeners();
    }
    this.stream = stream;
    this.captureSettings();

    // grab the formatted messages and also handle errors and such
    stream.on('data', this.handleFormattedMessage).on('end', this.handleTranscriptEnd).on('error', this.handleError);

    // when errors occur, the end event may not propagate through the helper streams.
    // However, the recognizeStream should always fire a end and close events
    stream.recognizeStream.on('end', () => {
      if (this.state.error) {
        this.handleTranscriptEnd();
      }
    });

    // grab raw messages from the debugging events for display on the JSON tab
    stream.recognizeStream
      .on('message', (frame, json) => this.handleRawMessage({ sent: false, frame, json }))
      .on('send-json', json => this.handleRawMessage({ sent: true, json }))
      .once('send-data', () => this.handleRawMessage({
        sent: true, binary: true, data: true, // discard the binary data to avoid waisting memory
      }))
      .on('close', (code, message) => this.handleRawMessage({ close: true, code, message }));

    // ['open','close','finish','end','error', 'pipe'].forEach(e => {
    //     stream.recognizeStream.on(e, console.log.bind(console, 'rs event: ', e));
    //     stream.on(e, console.log.bind(console, 'stream event: ', e));
    // });
  },

  handleRawMessage(msg) {
    this.setState({ rawMessages: this.state.rawMessages.concat(msg) });
  },

  handleFormattedMessage(msg) {
    this.setState({ formattedMessages: this.state.formattedMessages.concat(msg) });
  },

  handleTranscriptEnd() {
    // note: this function will be called twice on a clean end,
    // but may only be called once in the event of an error
    this.setState({ audioSource: null });
  },

  componentDidMount() {
    this.fetchToken();
    // tokens expire after 60 minutes, so automatcally fetch a new one ever 50 minutes
    // Not sure if this will work properly if a computer goes to sleep for > 50 minutes
    // and then wakes back up
    // react automatically binds the call to this
    // eslint-disable-next-line
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
    }) // todo: throw here if non-200 status
      .then(token => this.setState({ token })).catch(this.handleError);
  },

  getKeywords(model) {
    // a few models have more than two sample files, but the demo can only handle
    // two samples at the moment
    // so this just takes the keywords from the first two samples
    const files = samples[model];
    return (files && files.length >= 2 && `${files[0].keywords}, ${files[1].keywords}`) || '';
  },

  handleModelChange(model) {
    this.reset();
    this.setState({ model,
      keywords: this.getKeywords(model),
      speakerLabels: this.supportsSpeakerLabels(model) });

    // clear the microphone narrowband error if it's visible and a broadband model was just selected
    if (this.state.error === ERR_MIC_NARROWBAND && !this.isNarrowBand(model)) {
      this.setState({ error: null });
    }

    // clear the speaker_lables is not supported error - e.g.
    // speaker_labels is not a supported feature for model en-US_BroadbandModel
    if (this.state.error && this.state.error.indexOf('speaker_labels is not a supported feature for model') === 0) {
      this.setState({ error: null });
    }
  },

  supportsSpeakerLabels(model) {
    model = model || this.state.model;
    // todo: read the upd-to-date models list instead of the cached one
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

  // cleans up the keywords string into an array of individual, trimmed, non-empty keywords/phrases
  getKeywordsArr() {
    return this.state.keywords.split(',').map(k => k.trim()).filter(k => k);
  },

  // cleans up the keywords string and produces a unique list of keywords
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

    // When resultsBySpeaker is enabled, each msg.results array may contain multiple results.
    // However, all results in a given message will be either final or interim, so just checking
    // the first one still works here.
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
      // iPod Touch does this on iOS 11 - there is a microphone, but Safari claims there isn't
      err = 'Unable to access microphone';
    }
    this.setState({ error: err.message || err });
  },

  summarizeText() {
    let raw = '';

    console.log('8----------->');
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
      for(let j = i + 1; j < allMessages.length; j++){
        let node = this.intersect(allMessages[i], allMessages[j]);
        console.log(node);
        allScores[i] += node[0];
        allScores[j] += node[1];
      }
    }

    // let swaps = false;
    //   do {
    //     swaps = false;
    //     for (let i = 0; i < allMessages.length - 1; i++) {
    //       if (allScores[i] > allScores[i + 1]) {
    //         let temp = allScores[i + 1];
    //         let gay = allMessages[i + 1];
    //         allScores[i + 1] = allScores[i];
    //         allMessages[i + 1] = allMessages[i];
    //         allScores[i] = temp;
    //         allMessages[i] = gay;
    //         swaps = true;
    //       }
    //     }
    //   } while (swaps);
    //
    //   console.log(allMessages);
    //   console.log('all the scores are ', allScores);

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

   this.summarizeText();

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

        <div className="drop-info-container">
          <div className="drop-info">
            <h1>Drop an audio file here.</h1>
            <p>{'Watson Speech to Text supports .mp3, .mpeg, .wav, .opus, and .flac files up to 200mb.'}</p>
          </div>
        </div>

        <center>
          <h2 className="base--h1">Auto<b>note</b></h2>
        </center>

        <div className="flex buttons">
          <button className={micButtonClass} onClick={this.handleMicClick}>
            <Icon type={this.state.audioSource === 'mic' ? 'stop' : 'microphone'} fill={micIconFill} /> Record Meeting
          </button>
        </div>

        {err}

        <Tabs selected={0}>
          <Pane label="Transcript">
            {this.state.settingsAtStreamStart.speakerLabels
              ? <SpeakersView messages={messages} />
              : <Transcript messages={messages} />}
          </Pane>
        </Tabs>

      </Dropzone>
    );
  },
});
