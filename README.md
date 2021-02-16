# Echo360 Downloader
A tool for downloading Echo360 videos.

## Usage
- Install [Node](https://nodejs.org/en/).
- Run `npm install` in the cloned directory.
- Modify the `url` variable in `index.js` to the URL of the video you want to download.
- Run `node index.js`.

## Optional
To download a batch of videos, enter the URLs or IDs into the file `inputs.txt`, one per line.
When you run `node index.js` you will be prompted whether you would like to use the provided data from the `inputs.txt` file.
If you respond with `n`, you will be prompted to input a URL or ID to continue.