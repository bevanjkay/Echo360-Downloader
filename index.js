/*
	Copyright Myles Trevino
	Licensed under the Apache License, Version 2.0
	http://www.apache.org/licenses/LICENSE-2.0
*/

import FS from 'fs';
import Got from 'got';
import {CookieJar} from 'tough-cookie';
import * as M3U8Parser from 'm3u8-parser';
import FFmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import prompt from 'prompt';
import async from 'async';
import progress from 'cli-progress';
import { inherits } from 'util';


prompt.start();

let urls;
let title;

let url = ''; // The URL of the desired video.
FS.readFile('inputs.txt', 'utf8', function (err, data) {
	urls = data ? data.split('\n') : [];
	console.log(`${urls.length} videos in input file.`)
	console.log(urls.join('\n'));
	init(urls);
})

const outputFolder = 'Output';

const cookieJar = new CookieJar();

const urlPromptSchema = {
    properties: {
      url: {
        description: 'Please enter URL or ID of video',
        required: true
      },
    }
  };

const fileSchema = {
	properties: {
		file: {
			description: `Input file(s) found – Use this input (y/n)?`,
			message: 'Please enter y or n',
			pattern: /y|n/,
			required: true,
		}
	}
}

function init(data) {
	if (data.length) {
	prompt.get(fileSchema, function (err, result) {
		if (err) { console.log(err) }
		if (result.file === 'y') {
			async.eachSeries(urls, function(asyncUrl, next) {
				url = asyncUrl;
				return main(asyncUrl, next);
			}, function (err)  {
				if (err) {
					console.loge(err)
				} else {
					return done(null)
				}});	
		} else {
			getUrl();
		}
	})
	} else {
		getUrl();
	}
}


function done(err) {
	if (err) console.log(err);
	if (!err) console.log('All files processed successfully.');
	process.exit();
}



function getUrl() {
	prompt.get(urlPromptSchema, function (err, result) {
		if (err) { console.log(err)}
		url = result.url;
		main(url, done);
	});
};

// Extracts a substring from between the two given marker strings.
function extract(source, startMarker, endMarker)
{
	let start = source.indexOf(startMarker);
	if(start < 0) throw new Error('Failed to find the start marker.');
	start += startMarker.length;

	const end = source.indexOf(endMarker, start);
	if(end < 0) throw new Error('Failed to find the end marker.');

	return source.substring(start, end);
}


// Saves the stream contained in the given M3U8 playlist.
async function saveStream(type, playlist, m3u8Url)
{
	// Get the filename.
	// For Echo360, the stream filename corresponds to
	// the playlist filename, so we can substitute it.
	const fileName = playlist.uri.replace('.m3u8', '.m4s');
	console.log(`Downloading the ${type} stream...`);

	// Get the stream data.
	const streamUrl = m3u8Url.replace('s1_av.m3u8', fileName);
	const response = await Got(streamUrl, {cookieJar});

	// Save the stream.
	if(!FS.existsSync(outputFolder)) FS.mkdirSync(outputFolder);
	const filePath = `${outputFolder}/${title}-${type}`;
	FS.writeFileSync(filePath, response.rawBody);

	return filePath;
}




// Main.
async function main(asyncUrl, next)
{

	const ffmpeg = new FFmpeg();

	if (!/^http/.test(asyncUrl)) {
		url = `https://echo360.org.au/media/${asyncUrl}/public`
	}

	console.log(`Attempting to download video from ${asyncUrl}...`)

	try
	{
		// Get the cookies and keys.
		const indexResponse = await Got(asyncUrl, {cookieJar});
		const data = JSON.parse(extract(indexResponse.body,
			`Echo["mediaPlayerApp"]("`, `");`).replace(/\\/g, ''));

		const regex = /(?<=<title>).+(?=<\/title>)/
		title = indexResponse.body.match(regex)[0].replace('.mp4', '') || 'Video';

		console.log(`Found video with title ${title}...`)
		
		// Get the M3U8.
		const m3u8Url = data.sources.video1.source;
		const m3u8Response = await Got(m3u8Url, {cookieJar});

		// Parse the M3U8.
		const m3u8Parser = new M3U8Parser.Parser();
		m3u8Parser.push(m3u8Response.body);
		m3u8Parser.end();
		const parsedM3u8 = m3u8Parser.manifest;

		// Download.
		const videoFilePath = await saveStream('video', parsedM3u8.playlists[1], m3u8Url);
		const audioFilePath = await saveStream('audio', parsedM3u8.playlists[2], m3u8Url);

		// Merge the audio and video streams.

		// Initiate progress bar
		const progressBar = new progress.SingleBar({
			format: 'Merging [{bar}] {percentage}%'
		}, progress.Presets.legacy);

		progressBar.start(100, 0);

		// Run FFmpeg
		await new Promise(resolve => ffmpeg
			.setFfmpegPath(ffmpegPath)
			.input(videoFilePath)
			.videoCodec('copy')
			.input(audioFilePath)
			.audioCodec('copy')
			.on('progress', function (pro) {
				progressBar.update(Math.round(pro.percent));
			})
			.output( `${outputFolder}/${title}.mp4`, {end: true})
			.on('end', resolve)
			.run());

		// Remove created temporary files
		await new Promise(resolve => {
				
			FS.unlink(audioFilePath, () => {
				
			});

			FS.unlink(videoFilePath, () => {

				console.log('Finished...')

				resolve();
			});
		})

		// Process Next File
		if (next) {
		return next();
		} else {
			return done();
		}

			

	
	

	}	catch(error) { 

		return done(error.message);

		// Process Next File
		if (next) {
			return next();
			} else {
				return done();
			}

	}

}
