import { CreatioApi } from '../credentials/CreatioApi.credentials';

describe('CreatioApi credential', () => {
	const cred = new CreatioApi();

	test('credential test rejects invalid credentials via response-body rule', () => {
		expect(cred.test.rules).toBeDefined();
		const rule = cred.test.rules!.find((r) => r.type === 'responseSuccessBody');
		expect(rule).toBeDefined();
		// @ts-expect-error narrow to the rule's properties for assertion
		expect(rule.properties.key).toBe('Code');
		// @ts-expect-error narrow to the rule's properties for assertion
		expect(rule.properties.value).toBe(1);
	});
});
