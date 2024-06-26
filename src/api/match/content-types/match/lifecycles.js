const { ApplicationError } = require("@strapi/utils").errors;
const { MatchTeamData, MatchData, CupChampionTree } = require("../../../../Utils/CupTree");
function orderLeagueTeams(team1, team2) {
    if (team1.totalScore === team2.totalScore) {
        return team2.abnat - team1.abnat;
    } else {
        return team2.totalScore - team1.totalScore;
    }
}

function orderHezamTeams(team1, team2) {
    let team1ConsecutiveWins = getFrequencyOfValueInArray(team1.playedMatches, true)
    let team2ConsecutiveWins = getFrequencyOfValueInArray(team2.playedMatches, true)
    if (team1ConsecutiveWins === team2ConsecutiveWins) {

        let team1WinsInDirectMatchesWithTeam2 = team1.directMatches[team2.id].playedMatches
            .filter((elm) => elm === true).length
        let team2WinsInDirectMatchesWithTeam1 = team2.directMatches[team1.id].playedMatches
            .filter((elm) => elm === true).length
        if (team1WinsInDirectMatchesWithTeam2 === team2WinsInDirectMatchesWithTeam1) {
            let team1TotalWins = team1.playedMatches.filter((elm) => elm === true).length;
            let team2TotalWins = team2.playedMatches.filter((elm) => elm === true).length;
            if (team1TotalWins === team2TotalWins) {
                if (team1.directMatches[team2.id].abnat === team2.directMatches[team1.id].abnat) {
                    return team2.abnat - team1.abnat;
                } else {
                    return team2.directMatches[team1.id].abnat - team1.directMatches[team2.id].abnat
                }
            } else {
                return team2TotalWins - team1TotalWins
            }

        } else {
            return team2WinsInDirectMatchesWithTeam1 - team1WinsInDirectMatchesWithTeam2;
        }
    } else {
        return team2ConsecutiveWins - team1ConsecutiveWins;
    }
}

function getFrequencyOfValueInArray(arr, val) {
    let currentFreq = 0;
    let maxFreq = 0;
    for (let i = 0; i < arr.length; i++) {
        if (arr[i] === val) currentFreq++;
        else {
            if (currentFreq > maxFreq)
                maxFreq = currentFreq;
            currentFreq = 0;
        }
    }
    if (currentFreq > maxFreq)
        maxFreq = currentFreq;
    return maxFreq;
}

async function generateHezamTable(leagueId) {

    let teamsData = await strapi.db.connection.raw(`
        select t.id , t.name from leagues l 
        join leagues_team_links ltl on ltl.league_id = l.id
        join teams t on t.id = ltl.team_id
        where l.id =  ${leagueId} ;
    `)
    // let teams = [{name:"team1", id :1 } , {name:"team2", id : 2 } ,{name:"team3", id : 3 } ,{name:"team4", id : 4 } ,{name:"team5", id : 5} ,  ]; 
    let tableObj = {};

    teamsData.rows.forEach((team) => {
        tableObj[team.id] = {
            id: team.id,
            name: team.name,
            playedMatches: [],
            totalAbnatSum: 0,
            totalNumberOfRounds: 0,
            abnat: 0,
            directMatches: {}
        };
        teamsData.rows.forEach((elm) => {
            if (elm.id !== team.id)
                tableObj[team.id].directMatches[elm.id] = {
                    id: elm.id,
                    name: elm.name,
                    playedMatches: [],
                    abnat: 0,
                    totalAbnatSum: 0,
                    totalNumberOfRounds: 0,
                }
        })
    });

    let matchesData = await strapi.db.connection.raw(`
    select t1.id as team_1_id,t1.name as team_1_name,m.team_1_score,m.team_1_abnat 
        ,t2.id as team_2_id,t2.name as team_2_name,m.team_2_score,m.team_2_abnat ,m.number_of_rounds
    from leagues l 
    inner join matches_albtwlt_links mll on mll.league_id = l.id
    inner join matches m on  m.id = mll.match_id
    inner join matches_team_1_links mt1l on m.id = mt1l.match_id
    inner join matches_team_2_links mt2l on m.id = mt2l.match_id
    inner join teams t1 on t1.id = mt1l.team_id
    inner join teams t2 on t2.id = mt2l.team_id
    where l.id = ${leagueId} and m.state= 'انتهت'
	 order by m.start_at;
    `)

    let matches = matchesData.rows;
    for (let i = 0; i < matches.length; i++) {
        const match = matches[i];
        let { team_1_id, team_1_score, team_1_abnat, number_of_rounds,
            team_2_id, team_2_score, team_2_abnat } = match;

        tableObj[team_1_id].totalAbnatSum += team_1_abnat;
        tableObj[team_2_id].totalAbnatSum += team_2_abnat;

        tableObj[team_1_id].totalNumberOfRounds += number_of_rounds;
        tableObj[team_2_id].totalNumberOfRounds += number_of_rounds;

        tableObj[team_1_id].directMatches[team_2_id].totalAbnatSum += team_1_abnat;
        tableObj[team_2_id].directMatches[team_1_id].totalAbnatSum += team_2_abnat;

        tableObj[team_1_id].directMatches[team_2_id].totalNumberOfRounds += number_of_rounds;
        tableObj[team_2_id].directMatches[team_1_id].totalNumberOfRounds += number_of_rounds;

        tableObj[team_1_id].playedMatches.push(team_1_score > team_2_score);
        tableObj[team_2_id].playedMatches.push(team_2_score > team_1_score);
        tableObj[team_1_id].directMatches[team_2_id].playedMatches.push(team_1_score > team_2_score);
        tableObj[team_2_id].directMatches[team_1_id].playedMatches.push(team_2_score > team_1_score);
    }

    for (const team_id in tableObj) {
        tableObj[team_id].abnat = tableObj[team_id].totalNumberOfRounds !== 0 ? (tableObj[team_id].totalAbnatSum / tableObj[team_id].totalNumberOfRounds).toFixed(1) : 0;
        for (const vs_team_id in tableObj[team_id].directMatches) {
            tableObj[team_id].directMatches[vs_team_id].abnat = tableObj[team_id].directMatches[vs_team_id].totalNumberOfRounds !== 0 ?
                (tableObj[team_id].directMatches[vs_team_id].totalAbnatSum / tableObj[team_id].directMatches[vs_team_id].totalNumberOfRounds).toFixed(1) : 0;
        }
    }

    let tableArray = [];

    for (const team_id in tableObj) {
        tableArray.push(tableObj[team_id]);
    }
    tableArray = tableArray.sort(orderHezamTeams).map(elm => {

        return {
            id: elm.id,
            name: elm.name,
            play: elm.playedMatches.length,
            win: elm.playedMatches.filter(elm => elm === true).length,
            lost: elm.playedMatches.filter(elm => elm === false).length,
            abnat: elm.totalAbnatSum,
            consecutiveWins: getFrequencyOfValueInArray(elm.playedMatches, true)
        }
    })

    return tableArray;
}

async function generateLeagueTable(leagueId) {


    let teamsData = await strapi.db.connection.raw(`
        select t.id , t.name from leagues l 
        join leagues_team_links ltl on ltl.league_id = l.id
        join teams t on t.id = ltl.team_id
        where l.id =  ${leagueId} ;
    `)

    let tableObj = {};

    teamsData.rows.forEach((team) => {
        tableObj[team.id] = {
            id: team.id,
            name: team.name,
            abnat: 0,
            play: 0,
            lost: 0,
            win: 0,
            totalScore: 0,
            totalScoreForAbnat: 0,
            totalNumberOfRounds: 0
        };
    });

    let matchesData = await strapi.db.connection.raw(`
    select t1.id as team_1_id,t1.name as team_1_name,m.team_1_score,m.team_1_abnat 
        ,t2.id as team_2_id,t2.name as team_2_name,m.team_2_score,m.team_2_abnat ,m.number_of_rounds
    from leagues l 
    inner join matches_albtwlt_links mll on mll.league_id = l.id
    inner join matches m on  m.id = mll.match_id
    inner join matches_team_1_links mt1l on m.id = mt1l.match_id
    inner join matches_team_2_links mt2l on m.id = mt2l.match_id
    inner join teams t1 on t1.id = mt1l.team_id
    inner join teams t2 on t2.id = mt2l.team_id
    where l.id = ${leagueId} and m.state= 'انتهت';
    `)

    let matches = matchesData.rows;

    for (let i = 0; i < matches.length; i++) {
        const match = matches[i];
        for (let teamIdx = 1; teamIdx <= 2; teamIdx++) {
            let teamId = match[`team_${teamIdx}_id`]
            tableObj[teamId].totalScoreForAbnat += match[`team_${teamIdx}_abnat`];
            tableObj[teamId].totalNumberOfRounds += match.number_of_rounds;
            tableObj[teamId].play++;
        }
        if (match.team_1_score > match.team_2_score) {
            tableObj[match.team_1_id].win++;
            tableObj[match.team_1_id].totalScore = tableObj[match.team_1_id].win * 3;
            tableObj[match.team_2_id].lost++;

        } else {
            tableObj[match.team_2_id].win++;
            tableObj[match.team_2_id].totalScore = tableObj[match.team_2_id].win * 3;
            tableObj[match.team_1_id].lost++;
        }
    }

    for (const team_id in tableObj) {
        tableObj[team_id].abnat = (tableObj[team_id].totalScoreForAbnat / tableObj[team_id].totalNumberOfRounds).toFixed(1);
    }

    let tableArray = [];
    for (const team_id in tableObj) {
        tableArray.push(tableObj[team_id]);
    }

    tableArray = tableArray.sort(orderLeagueTeams)
    return tableArray;
}

async function generateCupTable(leagueId) {
    let teamsData = await strapi.db.connection.raw(`
        select t.id , t.name ,f.formats -> 'thumbnail' ->> 'url' as team_logo from leagues l 
        join leagues_team_links ltl on ltl.league_id = l.id
        join teams t on t.id = ltl.team_id
		join files_related_morphs frm on frm.related_id = t.id
        join files f on frm.file_id = f.id
        where l.id = ${leagueId} and frm.related_type = 'api::team.team';
    `)

    let teams = {};
    let teamsCount = 0;
    teamsData.rows.forEach((team) => {
        teams[team.id] = new MatchTeamData(team.id, team.team_logo, team.name)
        teamsCount++;
    });

    let matchesData = await strapi.db.connection.raw(`
    select m.id , mt1l.team_id as team_1_id, m.team_1_score, mt2l.team_id as team_2_id, m.team_2_score, m.start_at, m.state
    from leagues l 
    join matches_albtwlt_links mll on mll.league_id = l.id
    join matches m on m.id = mll.match_id
    join matches_team_1_links mt1l on m.id = mt1l.match_id
    join matches_team_2_links mt2l on m.id = mt2l.match_id
    where l.id = ${leagueId} 
    order by m.start_at asc;`)

    let matches = [];
    matchesData.rows.forEach((m) =>
        matches.push(new MatchData(m.id, teams[m.team_1_id], teams[m.team_2_id], m.team_1_score, m.team_2_score, m.start_at, m.state))
    );
    let tree = new CupChampionTree(teamsCount, matches, teams);
    return tree.getLevelsArrays();
}

async function handleLeagueTable(matchId){
    let leagues = await strapi.db.connection.raw(`
    select mll.league_id as leagueId , l.type
    from public.matches_albtwlt_links mll
    join leagues  l on l.id = mll.league_id
    where mll.match_id = ${matchId} and l.published_at is not null and (l.type = 'league' or l.type = 'hezam' or l.type = 'cup')
`)

if (leagues.rows.length != 1) {
    // match not belong to a league
    return;
}
let { leagueid, type } = leagues.rows[0];

let leagueTableData = await strapi.db.connection.raw(`
    select league_tables.id 
    from league_tables
    inner join league_tables_league_links ltll on ltll.league_table_id = league_tables.id
    where ltll.league_id = ${leagueid} 
`)

if (leagueTableData.rows.length === 0) {
    // league not a table 
    return;
}
let leagueTableID = leagueTableData.rows[0].id;

let tableArray;
switch (type) {
    case 'league':
        tableArray = await generateLeagueTable(leagueid);
        break;
    case 'hezam':
        tableArray = await generateHezamTable(leagueid);
        break;
    case 'cup':
        tableArray = await generateCupTable(leagueid);
        break;
}

await strapi.db.connection.raw(`
    UPDATE 
    league_tables
    SET data = '${JSON.stringify(tableArray)}'
    WHERE league_tables.id = ${leagueTableID};
`)

}

async function calculateMatchEstimationsScore(matchId){
    let match = await strapi.entityService.findOne("api::match.match" , matchId ,{
        populate :  ['team_1', 'team_2' , 'best_player']
    })
    // console.log(match)
    if( match.state !== "انتهت" || match.end_estimations === null || match.start_estimations === null) return ;
    let winnerTeamId= -1 ; 
    
    if(match.team1_score ?? 0  >  match.team2_score ?? 0)
        winnerTeamId = match.team_1?.id ?? -1 ; 
    else {
        winnerTeamId = match.team_2?.id ?? -1 ; 
    }
   
    let matchData = {
        countOf400 : (match.team1_400 ?? 0) + (match.team2_400 ?? 0) , 
        countOfKaboot :( match.team1_kababit_hakam_count ?? 0 )+ (match.team2_kababit_hakam_count ?? 0) +( match.team1_kababit_sun_count ?? 0) + (match.team2_kababit_sun_count ?? 0 ), 
        countOfRed : match.count_of_red_cards ?? 0 ,
        loserScore : Math.min((match.team1_score ?? 0) ,( match.team2_score ?? 0 )) , 
        bestPlayerId: match.best_player?.id ?? -1 ,
        winnerTeamId
    }

    let matchEstimations = await strapi.entityService.findMany("api::match-estimation.match-estimation" , { 
        populate:["best_player" , "winner_team"] ,
        filters : {match:{id : matchId}}
    })
    matchEstimations.forEach(async (estimation)=>{
        let score = 0 ; 
        if(matchData.winnerTeamId === estimation.winner_team.id && matchData.loserScore === estimation.loserScore )
            score+=2;
        if(matchData.countOf400 === estimation.countOf400)
            score+=1;
        if(matchData.countOfKaboot === estimation.countOfKaboots)
            score+=3;
        if(matchData.countOfRed === estimation.countOfRedCards)
            score+=2;
        if(matchData.bestPlayerId === estimation.best_player.id)
            score+=2;

        await strapi.entityService.update('api::match-estimation.match-estimation', estimation.id, {
            data: {
              estimation_score:score ,
            },
        });
    })
   
}

async function handleCRUDMatch(matchId) {
    await handleLeagueTable(matchId);
    await calculateMatchEstimationsScore(matchId)
}

module.exports = {

    beforeCreate(event) {

        let data = event.params.data;
        if (data.type !== "official") return;
        if (data.team_1.connect.length == 0 || data.team_2.connect.length == 0) {

            throw new ApplicationError("You Must Enter Two Teams")
        }
        if (data.team_1.connect[0].id == data.team_2.connect[0].id) {

            throw new ApplicationError("The Two Teams Must Be Different")
        }
    },

    async beforeUpdate(event) {
        let params = event.params;
        let matchId = params.where.id;
        if (event.params.data.type !== "official") return;

        let match = await strapi.entityService.findOne("api::match.match", matchId, {
            populate: {
                team_1: {
                    fields: ["id"],
                },
                team_2: {
                    fields: ["id"],
                },
            },
        })
        // the user erased the team 1
        if (params.data.team_1.disconnect.length !== 0 && params.data.team_1.connect.length === 0) {
            console.error("you must choose team 2");
            throw new ApplicationError("you must choose team 1")
        }
        // the user erased the team 2
        if (params.data.team_2.disconnect.length !== 0 && params.data.team_2.connect.length === 0) {
            console.error("you must choose team 2");
            throw new ApplicationError("you must choose team 2")
        }

        // the user updated team 1 with same value as team 2
        if (params.data.team_1.connect.length !== 0 && params.data.team_2.connect.length !== 0
            && params.data.team_1.connect[0].id === params.data.team_2.connect[0].id) {
            console.error("team1 and team2 changed : they equal each other : Team 1 can't be the same as team 2");
            throw new ApplicationError("Team 1 can't be the same as team 2")
        }
        else if (params.data.team_1.connect.length !== 0 && params.data.team_2.connect.length === 0
            && match.team_2.id === params.data.team_1.connect[0].id) {
            console.error("team1 changed : Team 1 can't be the same as team 2");
            throw new ApplicationError("Team 1 can't be the same as team 2")
        }
        // the user updated team 2 with same value as team 1
        else if (params.data.team_1.connect.length === 0 && params.data.team_2.connect.length !== 0
            && match.team_1.id === params.data.team_2.connect[0].id) {
            console.error("team2 changed : Team 1 can't be the same as team 2");
            throw new ApplicationError("Team 1 can't be the same as team 2");
        }
    }
    ,
    async afterCreate(event) {
        let matchId = event.result.id
        console.log(matchId);
        await handleCRUDMatch(matchId)
    },

    async afterUpdate(event) {
        let matchId = event.params.where.id;
        await handleCRUDMatch(matchId)
    },

    async afterDelete(event) {
        let matchId = event.params.where.id;
        await handleCRUDMatch(matchId)
    },
}

