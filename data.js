const PARTICIPANTS = [
  {
    id: 'dan',
    name: 'Dan',
    color: '#3b82f6',
    pays: true,
    teams: ['Algeria','Austria','Cabo Verde','Colombia','Egypt','IR Iran','Mexico','Netherlands','Tunisia']
  },
  {
    id: 'allanah',
    name: 'Allanah',
    color: '#ec4899',
    pays: true,
    teams: ['Brazil','Canada','Congo DR',"Côte d'Ivoire",'England','Haiti','New Zealand','Norway','Senegal']
  },
  {
    id: 'penie',
    name: 'Penie',
    color: '#f59e0b',
    pays: true,
    teams: ['Ecuador','Ghana','Japan','Korea Republic','Paraguay','Saudi Arabia','Scotland','Switzerland','Türkiye']
  },
  {
    id: 'jaiden',
    name: 'Jaiden',
    color: '#10b981',
    pays: true,
    teams: ['Australia','Croatia','Jordan','Panama','Portugal','Qatar','South Africa','Spain','Sweden']
  },
  {
    id: 'michael',
    name: 'Michael',
    color: '#8b5cf6',
    pays: true,
    teams: ['Argentina','Belgium','Bosnia and Herzegovina','Curaçao','Germany','Iraq','Morocco','USA','Uzbekistan']
  },
  {
    id: 'ava',
    name: 'Ava',
    color: '#f97316',
    pays: false,
    teams: ['Czechia','France','Uruguay']
  }
];

const GROUPS = {
  A: ['Mexico','South Africa','Korea Republic','Czechia'],
  B: ['Canada','Bosnia and Herzegovina','Qatar','Switzerland'],
  C: ['Brazil','Morocco','Haiti','Scotland'],
  D: ['USA','Paraguay','Australia','Türkiye'],
  E: ['Germany','Curaçao',"Côte d'Ivoire",'Ecuador'],
  F: ['Netherlands','Japan','Sweden','Tunisia'],
  G: ['Belgium','Egypt','IR Iran','New Zealand'],
  H: ['Spain','Cabo Verde','Saudi Arabia','Uruguay'],
  I: ['France','Senegal','Iraq','Norway'],
  J: ['Argentina','Algeria','Austria','Jordan'],
  K: ['Portugal','Congo DR','Uzbekistan','Colombia'],
  L: ['England','Croatia','Ghana','Panama']
};

const FLAGS = {
  'Algeria':'🇩🇿','Argentina':'🇦🇷','Australia':'🇦🇺','Austria':'🇦🇹',
  'Belgium':'🇧🇪','Bosnia and Herzegovina':'🇧🇦','Brazil':'🇧🇷',
  'Cabo Verde':'🇨🇻','Canada':'🇨🇦','Czechia':'🇨🇿','Colombia':'🇨🇴',
  'Congo DR':'🇨🇩',"Côte d'Ivoire":'🇨🇮','Croatia':'🇭🇷','Curaçao':'🇨🇼',
  'Ecuador':'🇪🇨','Egypt':'🇪🇬','England':'🏴󠁧󠁢󠁥󠁮󠁧󠁿','France':'🇫🇷',
  'Germany':'🇩🇪','Ghana':'🇬🇭','Haiti':'🇭🇹','Iraq':'🇮🇶','IR Iran':'🇮🇷',
  'Japan':'🇯🇵','Jordan':'🇯🇴','Korea Republic':'🇰🇷','Mexico':'🇲🇽',
  'Morocco':'🇲🇦','Netherlands':'🇳🇱','New Zealand':'🇳🇿','Norway':'🇳🇴',
  'Panama':'🇵🇦','Paraguay':'🇵🇾','Portugal':'🇵🇹','Qatar':'🇶🇦',
  'Saudi Arabia':'🇸🇦','Scotland':'🏴󠁧󠁢󠁳󠁣󠁴󠁿','Senegal':'🇸🇳',
  'South Africa':'🇿🇦','Spain':'🇪🇸','Sweden':'🇸🇪','Switzerland':'🇨🇭',
  'Tunisia':'🇹🇳','Türkiye':'🇹🇷','Uruguay':'🇺🇾','USA':'🇺🇸','Uzbekistan':'🇺🇿'
};

// Derived lookups built at load time
const TEAM_OWNER = {};
PARTICIPANTS.forEach(p => p.teams.forEach(t => { TEAM_OWNER[t] = p; }));

const TEAM_GROUP = {};
Object.entries(GROUPS).forEach(([g, teams]) => teams.forEach(t => { TEAM_GROUP[t] = g; }));

const ALL_TEAMS = Object.keys(FLAGS);
