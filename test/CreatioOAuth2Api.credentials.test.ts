import { CreatioOAuth2Api } from '../credentials/CreatioOAuth2Api.credentials';

describe('CreatioOAuth2Api credential', () => {
	const cred = new CreatioOAuth2Api();

	test('extends the oAuth2Api base', () => {
		expect(cred.extends).toContain('oAuth2Api');
	});

	test('uses the client-credentials grant', () => {
		const grant = cred.properties.find((p) => p.name === 'grantType');
		expect(grant?.default).toBe('clientCredentials');
	});

	test('exposes a creatioUrl property for the OData base', () => {
		expect(cred.properties.some((p) => p.name === 'creatioUrl')).toBe(true);
	});

	test('defines a credential test', () => {
		expect(cred.test).toBeDefined();
	});
});
