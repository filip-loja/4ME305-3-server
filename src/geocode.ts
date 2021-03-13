import { Geo } from './types'
import config from './config'
const https = require('https')

export const withTimeout = (timeout: number, userPromise: Promise<any>): Promise<any> => {
	const checkPromise = new Promise((resolve, reject) => {
		return setTimeout(() => reject('Request timed out'), timeout)
	})
	return Promise.race([checkPromise, userPromise])
}

const request = (url: string): Promise<any> => {
	return new Promise((resolve, reject) => {
		https.get(url, (resp: any) => {
			let data = ''
			resp.on('data', (chunk: any) => {
				data += chunk;
			})

			resp.on('end', () => {
				return resolve(JSON.parse(data))
			})

		}).on('error', (err: any) => {
			return reject(err)
		})
	})

}

export default async (geo: Geo): Promise<string> => {
	if (!geo || !geo.lat || !geo.lon) {
		return Promise.resolve(null)
	}
	const requestUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${geo.lat},${geo.lon}&key=${config.GOOGLE_API_KEY}`
	const resp = await withTimeout(10000, request(requestUrl))
	if (typeof resp === 'string') {
		console.log(resp)
		return null
	} else {
		let result = null
		if (resp.results && resp.results.length && resp.results[0]) {
			result = resp.results[0].formatted_address.split(' ').slice().reverse().slice(0, 2).reverse().join(' ')
		}
		return result
	}
}
