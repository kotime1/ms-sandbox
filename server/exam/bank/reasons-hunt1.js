// Why each RIGHT choice is right, and why each ordering step sits where it does (see reasons-manage1.js for the format).
export default {
  h001: { right: { DeviceProcessEvents: 'This table records process creation, with the command line and the initiating process.' } },
  h002: { right: { UrlClickEvents: 'This table records clicks on links in email and Office apps, including whether Safe Links blocked them.' } },
  h003: { right: { SigninLogs: 'Interactive Entra ID sign-ins are written to SigninLogs, including the location they came from.' } },
  h004: { blanks: {
    a: 'ago(1d) returns the time one day before now, so it works as a filter on Timestamp.',
    b: 'summarize groups rows and computes an aggregate, here count() by device, which the next line then filters.',
  } },
  h005: { blanks: {
    a: 'join combines two tables on matching key columns, which is what linking sign-ins to device logons needs.',
    b: 'summarize counts the joined rows per user after the tables are combined.',
  } },
  h006: { right: { BehaviorEntities: 'BehaviorInfo holds the behaviour summaries, and BehaviorEntities holds the entities involved. They are joined on the behaviour ID.' } },
  h007: { blanks: {
    a: 'contains finds the text anywhere in the command line, which is where the encoded flag appears.',
    b: 'sort by Timestamp desc puts the newest events first before project picks the columns.',
  } },
  h008: { right: { 'summarize arg_max(Timestamp, *) by DeviceId': 'arg_max returns the whole row with the largest Timestamp for each group, so you get the latest row per device with every column.' } },
  h009: { steps: [
    'Every query starts by naming the table it reads.',
    'Filter rows early, before aggregating, so the later steps work on less data.',
    'Aggregate next, which creates the Failures column.',
    'This filter comes after summarize because it uses the Failures column that summarize creates.',
    'Sort last, once the rows you want are decided.',
  ] },
  h010: { right: { 'The related incidents and impacted assets': 'These sections link the threat to your environment by showing the incidents and the devices or accounts affected in your tenant.' } },
  h011: { right: { 'Sentinel to use a data lake with graph support': 'Blast radius analysis relies on the graph infrastructure that comes with the Sentinel data lake.' } },
  h012: { right: { 'Synchronise user entities with Microsoft Entra ID': 'Syncing lets Sentinel resolve the different identifiers for one person to a single user entity, so the graph shows one node.' } },
  h013: { right: { 'Mark it as a favorite then turn on livestream': 'Favorites run each time you open the hunting page, and livestream lets you watch a query for new results during an investigation.' } },
  h014: { right: { 'A KQL job that promotes the results into an analytics table': 'KQL jobs run over data lake data and write the results to the analytics tier, where analytics rules can use them.' } },
  h015: { right: { 'A summary rule that stores hourly counts in a custom table': 'A summary rule aggregates the high-volume data on a schedule into a small table, so analysts query that instead of the raw rows.' } },
  h016: { right: { 'List the workspaces then add the workspace ID to the prompt': 'The MCP server has a tool to list workspaces, and the ID in the prompt tells the agent which one to query. The tenant header only handles sign-in.' } },
  h017: { right: {
    'The notebook can read data lake tables by using either Spark or Python code': 'Notebooks on the data lake run Python and Spark against its tables, including long-retention data.',
    'Results can be written back as tables for later hunting analysis': 'A notebook can save its results as a table, so later hunting can start from them.',
  } },
  h018: { blanks: {
    a: 'Advanced hunting tables share one schema, so tables from different Defender products can be joined.',
    b: 'Advanced hunting keeps 30 days of raw data.',
    c: 'Defender XDR tables use Timestamp. TimeGenerated is the column in Log Analytics and Sentinel tables.',
  } },
  h019: { right: { 'join kind=inner': 'An inner join keeps only the rows that match in both tables, which filters one set of addresses by the other.' } },
};
